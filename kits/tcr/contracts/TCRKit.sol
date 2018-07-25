pragma solidity 0.4.18;

import "@aragon/os/contracts/kernel/Kernel.sol";
import "@aragon/os/contracts/acl/ACL.sol";

import "@aragon/apps-curation/contracts/Curation.sol";
import "@aragon/apps-registry/contracts/RegistryApp.sol";
import "@aragon/apps-staking/contracts/Staking.sol";
import "@aragon/apps-plcr/contracts/PLCR.sol";

import "@aragon/kits-bare/contracts/KitBase.sol";


contract TCRKit is KitBase {
    RegistryApp registry;
    Staking staking;
    Staking voteStaking;
    PLCR plcr;
    Curation curation;

    function TCRKit(DAOFactory _fac, ENS _ens) KitBase(_fac, _ens) {}

    function newInstance(
        address root,
        ERC20 stakingToken,
        uint256 voteQuorum,
        uint256 minorityBlocSlash,
        uint64 commitDuration,
        uint64 revealDuration
    )
        public
        returns (Kernel)
    {
        Kernel dao = fac.newDAO(this);
        ACL acl = ACL(dao.acl());

        acl.createPermission(this, dao, dao.APP_MANAGER_ROLE(), this);

        deployApps(dao);

        registry.initialize();
        staking.initialize(false, stakingToken, new bytes(0), new bytes(0), new bytes(0));
        voteStaking.initialize(true, stakingToken, new bytes(0), new bytes(0), new bytes(0));
        plcr.initialize(voteStaking, voteQuorum, minorityBlocSlash, commitDuration, revealDuration);

        // ACLs
        // Registry
        acl.createPermission(curation, registry, registry.ADD_ENTRY_ROLE(), root);
        acl.createPermission(curation, registry, registry.REMOVE_ENTRY_ROLE(), root);
        // Staking
        acl.createPermission(acl.ANY_ENTITY(), staking, staking.STAKE_ROLE(), root);
        acl.createPermission(acl.ANY_ENTITY(), staking, staking.UNSTAKE_ROLE(), root);
        acl.createPermission(acl.ANY_ENTITY(), staking, staking.LOCK_ROLE(), root);
        acl.createPermission(curation, staking, staking.GOD_ROLE(), root);
        // Vote Staking
        acl.createPermission(acl.ANY_ENTITY(), voteStaking, voteStaking.STAKE_ROLE(), root);
        acl.createPermission(acl.ANY_ENTITY(), voteStaking, voteStaking.UNSTAKE_ROLE(), root);
        acl.createPermission(acl.ANY_ENTITY(), voteStaking, voteStaking.LOCK_ROLE(), root);
        acl.createPermission(plcr, voteStaking, voteStaking.GOD_ROLE(), root);
        // PLCR
        acl.createPermission(curation, plcr, plcr.CREATE_VOTE_ROLE(), root);
        // Curation
        acl.createPermission(root, curation, curation.CHANGE_PARAMS_ROLE(), root);
        acl.createPermission(root, curation, curation.CHANGE_VOTING_APP_ROLE(), root);

        cleanupDAOPermissions(dao, acl, root);

        DeployInstance(dao);

        return dao;
    }

    function initCuration(uint256 minDeposit, uint64 applyStageLen, uint256 dispensationPct) public returns (Curation) {
        curation.initialize(registry, staking, plcr, minDeposit, applyStageLen, dispensationPct);

        return curation;
    }


    function deployApps(Kernel dao) internal {
        bytes32 registryAppId = apmNamehash("registry");
        bytes32 stakingAppId = apmNamehash("staking");
        bytes32 plcrAppId = apmNamehash("plcr");
        bytes32 curationAppId = apmNamehash("tcr");

        registry = RegistryApp(dao.newAppInstance(registryAppId, latestVersionAppBase(registryAppId)));
        staking = Staking(dao.newAppInstance(stakingAppId, latestVersionAppBase(stakingAppId)));
        voteStaking = Staking(dao.newAppInstance(stakingAppId, latestVersionAppBase(stakingAppId)));
        plcr = PLCR(dao.newAppInstance(plcrAppId, latestVersionAppBase(plcrAppId)));
        curation = Curation(dao.newAppInstance(curationAppId, latestVersionAppBase(curationAppId)));

        InstalledApp(registry, registryAppId);
        InstalledApp(staking, stakingAppId);
        InstalledApp(voteStaking, stakingAppId);
        InstalledApp(plcr, plcrAppId);
        InstalledApp(curation, curationAppId);
    }
}
