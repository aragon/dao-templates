pragma solidity 0.4.24;

import "@aragon/os/contracts/kernel/Kernel.sol";
import "@aragon/os/contracts/acl/ACL.sol";

import "@aragon/kits-base/contracts/KitBase.sol";


contract BareKit is KitBase {
    constructor (DAOFactory _fac, ENS _ens) KitBase(_fac, _ens) {}

    function newBareInstance() public returns (Kernel dao, ERCProxy proxy) {
        return newInstance(bytes32(0), new bytes32[](0), address(0), new bytes(0));
    }

    function newInstance(bytes32 appId, bytes32[] roles, address authorizedAddress, bytes initializeCalldata) public returns (Kernel dao, ERCProxy proxy) {
        address root = msg.sender;
        dao = fac.newDAO(this);
        ACL acl = ACL(dao.acl());

        acl.createPermission(this, dao, dao.APP_MANAGER_ROLE(), this);

        // If there is no appId, an empty DAO will be created
        if (appId != bytes32(0)) {
            proxy = dao.newAppInstance(appId, latestVersionAppBase(appId), initializeCalldata, false);

            for (uint256 i = 0; i < roles.length; i++) {
                acl.createPermission(authorizedAddress, proxy, roles[i], root);
            }

            emit InstalledApp(proxy, appId);
        }

        cleanupDAOPermissions(dao, acl, root);

        emit DeployInstance(dao);
    }
}
