pragma solidity 0.4.18;

import "@aragon/os/contracts/kernel/Kernel.sol";
import "@aragon/os/contracts/acl/ACL.sol";
import "@aragon/os/contracts/apm/APMNamehash.sol";

import "@aragon/future-apps-payroll/contracts/Payroll.sol";
import "@aragon/apps-finance/contracts/Finance.sol";
import "@aragon/apps-vault/contracts/Vault.sol";

import "@aragon/kits-bare/contracts/KitBase.sol";


contract PayrollKit is KitBase {
    function PayrollKit(DAOFactory _fac, ENS _ens) KitBase(_fac, _ens) {}

    function newInstance(
        address employer,
        address root,
        uint64 financePeriodDuration,
        address denominationToken,
        IFeed priceFeed, 
        uint64 rateExpiryTime
    ) returns (Kernel dao, Payroll payroll) {
        dao = fac.newDAO(this);
        ACL acl = ACL(dao.acl());

        acl.createPermission(this, dao, dao.APP_MANAGER_ROLE(), this);

        Vault vault;
        Finance finance;
        (vault, finance, payroll) = deployApps(dao);
 
        finance.initialize(vault, financePeriodDuration);
        payroll.initialize(finance, denominationToken, priceFeed, rateExpiryTime);

        // Payroll permissions
        acl.createPermission(employer, payroll, payroll.ADD_EMPLOYEE_ROLE(), root);
        acl.createPermission(employer, payroll, payroll.REMOVE_EMPLOYEE_ROLE(), root);
        acl.createPermission(employer, payroll, payroll.ALLOWED_TOKENS_MANAGER_ROLE(), root);
        acl.createPermission(root, payroll, payroll.CHANGE_PRICE_FEED_ROLE(), root);
        acl.createPermission(root, payroll, payroll.MODIFY_RATE_EXPIRY_ROLE(), root);

        // Finance permissions
        acl.createPermission(payroll, finance, finance.CREATE_PAYMENTS_ROLE(), root);

        // Vault permissions
        bytes32 vaultTransferRole = vault.TRANSFER_ROLE();
        acl.createPermission(finance, vault, vaultTransferRole, this); // manager is this to allow 2 grants
        acl.grantPermission(root, vault, vaultTransferRole);
        acl.setPermissionManager(root, vault, vaultTransferRole); // set root as the final manager for the role

        cleanupDAOPermissions(dao, acl, root);

        DeployInstance(dao);
    }

    function deployApps(Kernel dao) internal returns (Vault, Finance, Payroll) {
        bytes32 vaultAppId = apmNamehash("vault");
        bytes32 financeAppId = apmNamehash("finance");
        bytes32 payrollAppId = apmNamehash("payroll");

        Vault vault = Vault(dao.newAppInstance(vaultAppId, latestVersionAppBase(vaultAppId)));
        Finance finance = Finance(dao.newAppInstance(financeAppId, latestVersionAppBase(financeAppId)));
        Payroll payroll = Payroll(dao.newAppInstance(payrollAppId, latestVersionAppBase(payrollAppId)));

        InstalledApp(vault, vaultAppId);
        InstalledApp(finance, financeAppId);
        InstalledApp(payroll, payrollAppId);

        return (vault, finance, payroll);
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

    function latestVersionAppBase(bytes32 appId) public view returns (address base) {
        Repo repo = Repo(PublicResolver(ens.resolver(appId)).addr(appId));
        (,base,) = repo.getLatest();

        return base;
    }
}
