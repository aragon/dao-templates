pragma solidity 0.4.24;

import "@aragon/apps-agent/contracts/Agent.sol";
import "@aragon/apps-vault/contracts/Vault.sol";
import "@aragon/apps-voting/contracts/Voting.sol";
//import "@aragon/apps-survey/contracts/Survey.sol";
import "@aragon/apps-finance/contracts/Finance.sol";
import "@aragon/apps-token-manager/contracts/TokenManager.sol";

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

    /* AGENT */

    function installAgentApp(Kernel dao) internal returns (Agent) {
        return Agent(installApp(dao, AGENT_APP_ID));
    }

    function installDefaultAgentApp(Kernel dao) internal returns (Agent) {
        return Agent(installDefaultApp(dao, AGENT_APP_ID));
    }

    /* FINANCE */

    function installFinanceApp(Kernel dao) internal returns (Finance) {
        return Finance(installApp(dao, FINANCE_APP_ID));
    }

    function installDefaultFinanceApp(Kernel dao) internal returns (Finance) {
        return Finance(installDefaultApp(dao, FINANCE_APP_ID));
    }

    /* SURVEY */

//    function installSurveyApp(Kernel dao) internal returns (Survey) {
//        return Survey(installApp(dao, SURVEY_APP_ID));
//    }
//
//    function installDefaultSurveyApp(Kernel dao) internal returns (Survey) {
//        return Survey(installDefaultApp(dao, SURVEY_APP_ID));
//    }

    /* TOKEN MANAGER */

    function installTokenManagerApp(Kernel dao) internal returns (TokenManager) {
        return TokenManager(installApp(dao, TOKEN_MANAGER_APP_ID));
    }

    function installDefaultTokenManagerApp(Kernel dao) internal returns (TokenManager) {
        return TokenManager(installDefaultApp(dao, TOKEN_MANAGER_APP_ID));
    }

    /* VAULT */

    function installVaultApp(Kernel dao) internal returns (Vault) {
        return Vault(installApp(dao, VAULT_APP_ID));
    }

    function installDefaultVaultApp(Kernel dao) internal returns (Vault) {
        return Vault(installDefaultApp(dao, VAULT_APP_ID));
    }

    /* VOTING */

    function installVotingApp(Kernel dao) internal returns (Voting) {
        return Voting(installApp(dao, VOTING_APP_ID));
    }

    function installDefaultVotingApp(Kernel dao) internal returns (Voting) {
        return Voting(installDefaultApp(dao, VOTING_APP_ID));
    }

    /* APPS */

    function installApp(Kernel dao, bytes32 appId) internal returns (address) {
        return installApp(dao, appId, new bytes(0), false);
    }

    function installDefaultApp(Kernel dao, bytes32 appId) internal returns (address) {
        return installApp(dao, appId, new bytes(0), true);
    }

    function installApp(Kernel dao, bytes32 appId, bytes data, bool setDefault) internal returns (address) {
        address latestBaseAppAddress = latestVersionAppBase(appId);
        address instance = address(dao.newAppInstance(appId, latestBaseAppAddress, data, setDefault));
        emit InstalledApp(instance, appId);
        return instance;
    }
}
