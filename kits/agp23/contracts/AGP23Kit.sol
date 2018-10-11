pragma solidity 0.4.24;

import "@aragon/apps-voting/contracts/Voting.sol";
import "@aragon/apps-vault/contracts/Vault.sol";
import "@aragon/apps-token-manager/contracts/TokenManager.sol";
import "@aragon/apps-shared-minime/contracts/MiniMeToken.sol";
import "@aragon/apps-voting-daemon/contracts/VotingDaemon.sol";

import "@aragon/kits-bare/contracts/KitBase.sol";

import "@aragon/os/contracts/apm/APMNamehash.sol";
import "@aragon/os/contracts/common/EtherTokenConstant.sol";


contract AGP23Kit is KitBase, APMNamehash, EtherTokenConstant {
    MiniMeTokenFactory tokenFactory;
    uint256 constant public MAIN_VOTING_SUPPORT = 50 * 10**16; // 50%
    uint256 constant public MAIN_VOTING_ACCEPTANCE = 33 * 10**16; // 33%, not exact but it works, quorum of 1 would work as well
    uint64 constant public MAIN_VOTING_VOTE_TIME = 4 weeks;

    uint256 constant public VETO_VOTING_SUPPORT = 50 * 10**16; // >50% of the casted votes have to be YES
    uint256 constant public VETO_VOTING_ACCEPTANCE = 1 * 10**16; // >1% of ANT must vote YES to veto
    uint64 constant public VETO_VOTING_VOTE_TIME = 3 weeks;

    uint256 constant public ETH_DAEMON_REWARD = 0; // 1 * 10**16; // 0.01 ETH

    bytes32 constant public daemonAppId = apmNamehash("voting-daemon");
    bytes32 constant public votingAppId = apmNamehash("voting");
    bytes32 constant public vaultAppId = apmNamehash("vault");
    bytes32 constant public tokenManagerAppId = apmNamehash("token-manager");

    constructor (ENS _ens)
        KitBase(DAOFactory(0), _ens) {

        tokenFactory = new MiniMeTokenFactory();
        fac = KitBase(latestVersionAppBase(apmNamehash("bare-kit"))).fac();
    }

    function newInstance(MiniMeToken ant, address[] voters) external returns (Kernel) {
        var (dao, acl, mainVoting) = _newInstance(ant, voters);
        cleanupDAOPermissions(dao, acl, mainVoting);

        return dao;
    }

    function newTestInstance() external returns (Kernel) {
        MiniMeToken testAnt = tokenFactory.createCloneToken(MiniMeToken(0), 0, "TEST-ANT", 18, "TEST-ANT", true);

        address[] memory voters = new address[](2);
        voters[0] = msg.sender;
        voters[1] = 0x1234; // hardcode another address to test tie-breaking?

        var (dao, acl, mainVoting) = _newInstance(testAnt, voters);

        TokenManager testAntManager = TokenManager(dao.newAppInstance(tokenManagerAppId, latestVersionAppBase(tokenManagerAppId)));
        testAnt.changeController(testAntManager);
        testAntManager.initialize(testAnt, true, 0);
        acl.createPermission(address(-1), testAntManager, testAntManager.MINT_ROLE(), msg.sender); // anyone can mint main tokens
        testAntManager.mint(msg.sender, 1000 * 10**18);

        cleanupDAOPermissions(dao, acl, mainVoting);

        return dao;
    }

    function _newInstance(MiniMeToken ant, address[] voters) internal returns (Kernel, ACL, Voting) {
        require(voters.length == 2);

        Kernel dao = fac.newDAO(this);
        ACL acl = ACL(dao.acl());

        acl.createPermission(this, dao, dao.APP_MANAGER_ROLE(), this);

        TokenManager tokenManager = TokenManager(dao.newAppInstance(tokenManagerAppId, latestVersionAppBase(tokenManagerAppId)));
        Voting mainVoting = Voting(dao.newAppInstance(votingAppId, latestVersionAppBase(votingAppId)));
        Voting vetoVoting = Voting(dao.newAppInstance(votingAppId, latestVersionAppBase(votingAppId)));
        Vault vault = Vault(dao.newAppInstance(vaultAppId, latestVersionAppBase(vaultAppId)));
        VotingDaemon votingDaemon = VotingDaemon(dao.newAppInstance(daemonAppId, latestVersionAppBase(daemonAppId)));
        MiniMeToken token = tokenFactory.createCloneToken(MiniMeToken(0), 0, "AGP23", 0, "AGP23", true);
        token.changeController(tokenManager);

        vetoVoting.initialize(
            ant,
            VETO_VOTING_SUPPORT,
            VETO_VOTING_ACCEPTANCE,
            VETO_VOTING_VOTE_TIME
        );
        mainVoting.initialize(
            token,
            MAIN_VOTING_SUPPORT,
            MAIN_VOTING_ACCEPTANCE,
            MAIN_VOTING_VOTE_TIME
        );
        votingDaemon.initialize(
            mainVoting,
            vetoVoting,
            false,
            vault,
            ETH,
            ETH_DAEMON_REWARD
        );
        vault.initialize();
        tokenManager.initialize(token, false, 1);

        acl.createPermission(this, tokenManager, tokenManager.MINT_ROLE(), this);
        tokenManager.mint(voters[0], 1);
        tokenManager.mint(voters[1], 1);
        tokenManager.mint(vetoVoting, 1);
        cleanupPermission(acl, address(1), tokenManager, tokenManager.MINT_ROLE()); // no more minting

        acl.createPermission(mainVoting, vault, vault.TRANSFER_ROLE(), this);
        acl.grantPermission(votingDaemon, vault, vault.TRANSFER_ROLE());
        acl.setPermissionManager(mainVoting, vault, vault.TRANSFER_ROLE());
        acl.createPermission(voters[0], mainVoting, mainVoting.CREATE_VOTES_ROLE(), this);
        acl.grantPermission(voters[1], mainVoting, mainVoting.CREATE_VOTES_ROLE());
        acl.setPermissionManager(mainVoting, mainVoting, mainVoting.CREATE_VOTES_ROLE());
        acl.createPermission(votingDaemon, vetoVoting, vetoVoting.CREATE_VOTES_ROLE(), mainVoting);

        // TODO: Burn CHANGE_QUORUM and CHANGE_SUPPORT roles in voting apps?
        emit DeployInstance(dao);

        return (dao, acl, mainVoting);
    }
}