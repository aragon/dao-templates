pragma solidity 0.4.18;

import "@aragon/os/contracts/apm/Repo.sol";
import "@aragon/os/contracts/factory/DAOFactory.sol";
import "@aragon/os/contracts/kernel/Kernel.sol";
import "@aragon/os/contracts/acl/ACL.sol";
import "@aragon/os/contracts/lib/minime/MiniMeToken.sol";
import "@aragon/os/contracts/lib/ens/ENS.sol";
import "@aragon/os/contracts/lib/ens/PublicResolver.sol";

import "@aragon/apps-voting/contracts/Voting.sol";


contract SignalingKit {
    ENS ens;
    DAOFactory fac;

    uint256 constant 1_PERCENT = 10 ** 16;
    uint64 constant public VOTE_DURATION = 14 days;            // signaling votes are open for 14 days
    uint256 constant public SUPPORT_REQUIRED = 50 * 1_PERCENT; // because votes are binary, we consider 50% an approved vote
    uint256 constant public ACCEPTANCE_QUORUM = 5 * 1_PERCENT; // even if it has >50% support, at least 5% of holders need to approve for the signal to be valid 

    bytes32 constant public ETH_NODE = keccak256(keccak256(0), keccak256("eth"));
    bytes32 constant public APM_NODE = keccak256(keccak256(ETH_NODE), keccak256("aragonpm"));
    bytes32 constant public VOTING_APP_ID = keccak256(APM_NODE, keccak256("voting")); // voting.aragonpm.eth

    event DeployInstance(address dao);
    event InstalledApp(address appProxy, bytes32 appId);

    function SignalingKit(DAOFactory _fac, ENS _ens) {
        ens = _ens;
        fac = _fac; // factory must be set up w/o EVMScript support
    }

    function newInstance(MiniMeToken signalingToken, address votingManager, address scapeHatch) returns (Kernel, Voting) {
        Kernel dao = fac.newDAO(this);
        ACL acl = ACL(dao.acl());

        acl.createPermission(this, dao, dao.APP_MANAGER_ROLE(), this);

        Voting voting = Voting(dao.newAppInstance(VOTING_APP_ID, latestVersionAppBase(VOTING_APP_ID)));

        // TODO: Set scapeHatch address as the default vote, in case a token rescue is required

        // initialize a voting app with the above constants
        voting.initialize(token, SUPPORT_REQUIRED, ACCEPTANCE_QUORUM, VOTE_DURATION);

        // set voting manager as the entity that can create votes and change min quorum 
        // votingManager can then give this permission to other entities
        acl.createPermission(votingManager, voting, voting.CREATE_VOTES_ROLE(), votingManager);
        acl.createPermission(votingManager, voting, voting.MODIFY_QUORUM_ROLE(), votingManager);
        
        InstalledApp(voting, votingAppId());
        DeployInstance(dao);

        return (dao, voting);
    }

    function latestVersionAppBase(bytes32 appId) internal view returns (address base) {
        Repo repo = Repo(PublicResolver(ens.resolver(appId)).addr(appId));
        (,base,) = repo.getLatest();

        return base;
    }
}
