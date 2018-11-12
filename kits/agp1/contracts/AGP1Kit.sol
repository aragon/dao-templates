pragma solidity 0.4.24;

import "@aragon/apps-finance/contracts/Finance.sol";
import "@aragon/apps-vault/contracts/Vault.sol";
import "@aragon/apps-voting/contracts/Voting.sol";
import "@aragon/apps-shared-minime/contracts/MiniMeToken.sol";

import "@aragon/os/contracts/apm/APMNamehash.sol";
import "@aragon/os/contracts/common/IsContract.sol";

import "@aragon/kits-base/contracts/KitBase.sol";


contract AGP1Kit is KitBase, APMNamehash, IsContract {

    uint64 constant public MAIN_VOTING_SUPPORT = 50 * 10**16; // > 50%
    uint64 constant public MAIN_VOTING_QUORUM = 0; // Just 1 vote is enough
    uint64 constant public MAIN_VOTING_VOTE_TIME = 48 hours;

    uint64 constant public META_TRACK_VOTING_SUPPORT = 666666666666666666; // > two thirds
    uint64 constant public META_TRACK_VOTING_QUORUM = 0; // Just 1 vote is enough
    uint64 constant public META_TRACK_VOTING_VOTE_TIME = 48 hours;

    uint64 constant public FINANCE_PERIOD_DURATION = 7889400; // 365.25 days / 4

    bytes32 constant private financeAppId = apmNamehash("finance");
    bytes32 constant private vaultAppId = apmNamehash("vault");
    bytes32 constant private votingAppId = apmNamehash("voting");

    constructor(DAOFactory _fac, ENS _ens) KitBase(_fac, _ens) public {
        require(isContract(address(_fac.regFactory())));
    }

    function newInstance(MiniMeToken _ant, address _multisig) external returns (Kernel) {
        Kernel dao = fac.newDAO(this);
        ACL acl = ACL(dao.acl());

        acl.createPermission(this, dao, dao.APP_MANAGER_ROLE(), this);

        Vault vault = Vault(
            dao.newAppInstance(
                vaultAppId,
                latestVersionAppBase(vaultAppId),
                new bytes(0),
                true
            )
        );
        emit InstalledApp(vault, vaultAppId);

        Finance finance = Finance(dao.newAppInstance(financeAppId, latestVersionAppBase(financeAppId)));
        emit InstalledApp(finance, financeAppId);

        Voting voting = Voting(dao.newAppInstance(votingAppId, latestVersionAppBase(votingAppId)));
        emit InstalledApp(voting, votingAppId);

        Voting metaTrackVoting = Voting(dao.newAppInstance(votingAppId, latestVersionAppBase(votingAppId)));
        emit InstalledApp(metaTrackVoting, votingAppId);

        // permissions
        acl.createPermission(_multisig, voting, voting.CREATE_VOTES_ROLE(), _multisig);
        acl.createPermission(metaTrackVoting, voting, voting.MODIFY_QUORUM_ROLE(), metaTrackVoting);
        acl.createPermission(metaTrackVoting, voting, voting.MODIFY_SUPPORT_ROLE(), metaTrackVoting);

        acl.createPermission(_multisig, metaTrackVoting, metaTrackVoting.CREATE_VOTES_ROLE(), _multisig);
        acl.createPermission(metaTrackVoting, metaTrackVoting, metaTrackVoting.MODIFY_QUORUM_ROLE(), metaTrackVoting);
        acl.createPermission(metaTrackVoting, metaTrackVoting, metaTrackVoting.MODIFY_SUPPORT_ROLE(), metaTrackVoting);

        acl.createPermission(finance, vault, vault.TRANSFER_ROLE(), metaTrackVoting);
        acl.createPermission(voting, finance, finance.CREATE_PAYMENTS_ROLE(), metaTrackVoting);
        acl.createPermission(voting, finance, finance.EXECUTE_PAYMENTS_ROLE(), metaTrackVoting);
        acl.createPermission(voting, finance, finance.MANAGE_PAYMENTS_ROLE(), metaTrackVoting);

        // App inits
        vault.initialize();
        finance.initialize(vault, FINANCE_PERIOD_DURATION);
        voting.initialize(_ant, MAIN_VOTING_SUPPORT, MAIN_VOTING_QUORUM, MAIN_VOTING_VOTE_TIME);
        metaTrackVoting.initialize(_ant, META_TRACK_VOTING_SUPPORT, META_TRACK_VOTING_QUORUM, META_TRACK_VOTING_VOTE_TIME);

        // cleanup
        cleanupDAOPermissions(dao, acl, metaTrackVoting);

        emit DeployInstance(dao);

        return dao;
    }
}
