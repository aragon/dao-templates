pragma solidity 0.4.24;

import "@aragon/os/contracts/apm/Repo.sol";
import "@aragon/os/contracts/apm/APMNamehash.sol";
import "@aragon/os/contracts/lib/ens/ENS.sol";
import "@aragon/os/contracts/factory/DAOFactory.sol";
import "@aragon/os/contracts/lib/ens/PublicResolver.sol";


contract KitBase is APMNamehash {
    bytes32 constant internal AGENT_APP_ID = apmNamehash("agent");                    // agent.aragonpm.eth
    bytes32 constant internal FINANCE_APP_ID = apmNamehash("finance");                // finance.aragonpm.eth
    bytes32 constant internal PAYROLL_APP_ID = apmNamehash("payroll");                // payroll.aragonpm.eth
    bytes32 constant internal SURVEY_APP_ID = apmNamehash("survey");                  // survey.aragonpm.eth
    bytes32 constant internal TOKEN_MANAGER_APP_ID = apmNamehash("token-manager");    // token-manager.aragonpm.eth
    bytes32 constant internal VOTING_APP_ID = apmNamehash("voting");                  // voting.aragonpm.eth
    bytes32 constant internal VAULT_APP_ID = apmNamehash("vault");                    // vault.aragonpm.eth

    ENS public ens;
    DAOFactory public daoFactory;

    event DeployInstance(address dao);
    event InstalledApp(address appProxy, bytes32 appId);

    constructor (DAOFactory _daoFactory, ENS _ens) public {
        daoFactory = _daoFactory;
        ens = _ens;
    }

    function latestVersionAppBase(bytes32 appId) public view returns (address base) {
        Repo repo = Repo(PublicResolver(ens.resolver(appId)).addr(appId));
        (,base,) = repo.getLatest();

        return base;
    }

    function cleanupDAOPermissions(Kernel dao, ACL acl, address root) internal {
        // Kernel permission clean up
        cleanupPermission(acl, root, dao, dao.APP_MANAGER_ROLE());

        // ACL permission clean up
        cleanupPermission(acl, root, acl, acl.CREATE_PERMISSIONS_ROLE());
    }

    function cleanupPermission(ACL acl, address root, address app, bytes32 permission) internal {
        acl.grantPermission(root, app, permission);
        acl.revokePermission(this, app, permission);
        acl.setPermissionManager(root, app, permission);
    }
}
