pragma solidity 0.4.18;

import "@aragon/os/contracts/factory/DAOFactory.sol";
import "@aragon/os/contracts/apm/Repo.sol";
import "@aragon/os/contracts/apm/APMNamehash.sol";
import "@aragon/os/contracts/lib/ens/ENS.sol";
import "@aragon/os/contracts/lib/ens/PublicResolver.sol";


contract KitBase is APMNamehash {
    ENS public ens;
    DAOFactory public fac;

    event DeployInstance(address dao);
    event InstalledApp(address appProxy, bytes32 appId);

    function KitBase(DAOFactory _fac, ENS _ens) {
        fac = _fac;
        ens = _ens;
    }

    function latestVersionAppBase(bytes32 appId) public view returns (address base) {
        Repo repo = Repo(PublicResolver(ens.resolver(appId)).addr(appId));
        (,base,) = repo.getLatest();

        return base;
    }

    function cleanupDAOPermissions(Kernel dao, ACL acl, address root) internal {
        bytes32 daoAppManagerRole = dao.APP_MANAGER_ROLE();
        // Kernel permission clean up
        acl.grantPermission(root, dao, daoAppManagerRole);
        acl.revokePermission(this, dao, daoAppManagerRole);
        acl.setPermissionManager(root, dao, daoAppManagerRole);

        // ACL permission clean up
        bytes32 aclCreatePermissionsRole = acl.CREATE_PERMISSIONS_ROLE();
        acl.grantPermission(root, acl, aclCreatePermissionsRole);
        acl.revokePermission(this, acl, aclCreatePermissionsRole);
        acl.setPermissionManager(root, acl, aclCreatePermissionsRole);
    }
}
