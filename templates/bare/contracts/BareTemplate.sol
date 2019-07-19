pragma solidity 0.4.24;

import "@aragon/templates-shared/contracts/BaseTemplate.sol";


contract BareTemplate is BaseTemplate {

    constructor(DAOFactory _daoFactory, ENS _ens, MiniMeTokenFactory _miniMeFactory, IFIFSResolvingRegistrar _aragonID)
        BaseTemplate(_daoFactory, _ens, _miniMeFactory, _aragonID)
        public
    {
        // solium-disable-previous-line no-empty-blocks
    }

    function newInstance() public {
        newInstance(bytes32(0), new bytes32[](0), address(0), new bytes(0));
    }

    function newInstance(bytes32 appId, bytes32[] roles, address authorizedAddress, bytes initializeCallData) public {
        address root = msg.sender;
        (Kernel dao, ACL acl) = _createDAO();

        // If there is no appId, an empty DAO will be created
        if (appId != bytes32(0)) {
            address proxy = _installApp(dao, appId, initializeCallData, false);
            for (uint256 i = 0; i < roles.length; i++) {
                acl.createPermission(authorizedAddress, proxy, roles[i], root);
            }
        }

        _transferPermissionFromTemplate(acl, root, dao, dao.APP_MANAGER_ROLE());
        _transferPermissionFromTemplate(acl, root, acl, acl.CREATE_PERMISSIONS_ROLE());
    }
}
