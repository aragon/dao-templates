pragma solidity 0.4.24;

import "@aragon/apps-agent/contracts/Agent.sol";
import "@aragon/apps-vault/contracts/Vault.sol";
import "@aragon/apps-voting/contracts/Voting.sol";
import "@aragon/apps-finance/contracts/Finance.sol";
import "@aragon/apps-token-manager/contracts/TokenManager.sol";
import "@aragon/apps-shared-minime/contracts/MiniMeToken.sol";

import "@aragon/os/contracts/acl/ACL.sol";
import "@aragon/os/contracts/apm/Repo.sol";
import "@aragon/os/contracts/apm/APMNamehash.sol";
import "@aragon/os/contracts/kernel/Kernel.sol";
import "@aragon/os/contracts/lib/ens/ENS.sol";
import "@aragon/os/contracts/lib/ens/PublicResolver.sol";
import "@aragon/os/contracts/factory/DAOFactory.sol";
import "@aragon/os/contracts/common/IsContract.sol";
import "@aragon/id/contracts/IFIFSResolvingRegistrar.sol";


contract BaseTemplate is APMNamehash, IsContract {
    /* Hardcoded constant to save gas
    * bytes32 constant internal AGENT_APP_ID = apmNamehash("agent");                  // agent.aragonpm.eth
    * bytes32 constant internal VAULT_APP_ID = apmNamehash("vault");                  // vault.aragonpm.eth
    * bytes32 constant internal VOTING_APP_ID = apmNamehash("voting");                // voting.aragonpm.eth
    * bytes32 constant internal FINANCE_APP_ID = apmNamehash("finance");              // finance.aragonpm.eth
    * bytes32 constant internal TOKEN_MANAGER_APP_ID = apmNamehash("token-manager");  // token-manager.aragonpm.eth
    */

    bytes32 constant internal AGENT_APP_ID = 0x9ac98dc5f995bf0211ed589ef022719d1487e5cb2bab505676f0d084c07cf89a;
    bytes32 constant internal VAULT_APP_ID = 0x7e852e0fcfce6551c13800f1e7476f982525c2b5277ba14b24339c68416336d1;
    bytes32 constant internal VOTING_APP_ID = 0x9fa3927f639745e587912d4b0fea7ef9013bf93fb907d29faeab57417ba6e1d4;
    bytes32 constant internal FINANCE_APP_ID = 0xbf8491150dafc5dcaee5b861414dca922de09ccffa344964ae167212e8c673ae;
    bytes32 constant internal TOKEN_MANAGER_APP_ID = 0x6b20a3010614eeebf2138ccec99f028a61c811b3b1a3343b6ff635985c75c91f;

    ENS public ens;
    DAOFactory public daoFactory;
    MiniMeTokenFactory public miniMeFactory;
    IFIFSResolvingRegistrar public aragonID;

    event DeployDao(address dao);
    event DeployToken(address token);
    event InstalledApp(address appProxy, bytes32 appId);

    constructor(DAOFactory _daoFactory, ENS _ens, MiniMeTokenFactory _miniMeFactory, IFIFSResolvingRegistrar _aragonID) public {
        require(isContract(address(_ens)), "TEMPLATE_ENS_NOT_CONTRACT");
        require(isContract(address(_daoFactory)), "TEMPLATE_DAO_FACTORY_NOT_CONTRACT");

        ens = _ens;
        aragonID = _aragonID;
        daoFactory = _daoFactory;
        miniMeFactory = _miniMeFactory;
    }

    function _createDAO() internal returns (Kernel dao, ACL acl) {
        dao = daoFactory.newDAO(this);
        emit DeployDao(address(dao));
        acl = ACL(dao.acl());
        _createPermissionForTemplate(acl, dao, dao.APP_MANAGER_ROLE());
    }

    /* ACL */

    function _createPermissions(ACL acl, address[] grantees, address app, bytes32 permission, address manager) internal {
        acl.createPermission(grantees[0], app, permission, address(this));
        for (uint256 i = 1; i < grantees.length; i++) {
            acl.grantPermission(grantees[i], app, permission);
        }
        acl.revokePermission(address(this), app, permission);
        acl.setPermissionManager(manager, app, permission);
    }

    function _createPermissionForTemplate(ACL acl, address app, bytes32 permission) internal {
        acl.createPermission(address(this), app, permission, address(this));
    }

    function _removePermissionFromTemplate(ACL acl, address app, bytes32 permission) internal {
        acl.revokePermission(address(this), app, permission);
        acl.removePermissionManager(app, permission);
    }

    function _transferPermissionFromTemplate(ACL acl, address to, address app, bytes32 permission) internal {
        _transferPermissionFromTemplate(acl, to, to, app, permission);
    }

    function _transferPermissionFromTemplate(ACL acl, address to, address manager, address app, bytes32 permission) internal {
        acl.grantPermission(to, app, permission);
        acl.revokePermission(address(this), app, permission);
        acl.setPermissionManager(manager, app, permission);
    }

    /* AGENT */

    function _installDefaultAgentApp(Kernel dao) internal returns (Agent) {
        Agent agent = Agent(_installDefaultApp(dao, AGENT_APP_ID));
        agent.initialize();
        return agent;
    }

    function _installNonDefaultAgentApp(Kernel dao) internal returns (Agent) {
        Agent agent = Agent(_installNonDefaultApp(dao, AGENT_APP_ID));
        agent.initialize();
        return agent;
    }

    function _createAgentPermissions(ACL acl, Agent agent, address grantee, address manager) internal {
        acl.createPermission(grantee, agent, agent.EXECUTE_ROLE(), manager);
        acl.createPermission(grantee, agent, agent.RUN_SCRIPT_ROLE(), manager);
    }

    /* FINANCE */

    function _installFinanceApp(Kernel dao, Vault vault, uint64 periodDuration) internal returns (Finance) {
        Finance finance = Finance(_installNonDefaultApp(dao, FINANCE_APP_ID));
        finance.initialize(vault, periodDuration);
        return finance;
    }

    function _createFinancePermissions(ACL acl, Finance finance, address grantee, address manager) internal {
        acl.createPermission(grantee, finance, finance.CREATE_PAYMENTS_ROLE(), manager);
        acl.createPermission(grantee, finance, finance.EXECUTE_PAYMENTS_ROLE(), manager);
        acl.createPermission(grantee, finance, finance.MANAGE_PAYMENTS_ROLE(), manager);
    }

    /* TOKEN MANAGER */

    function _installTokenManagerApp(Kernel dao, MiniMeToken token, bool transferable, uint256 maxAccountTokens) internal returns (TokenManager) {
        TokenManager tokenManager = TokenManager(_installNonDefaultApp(dao, TOKEN_MANAGER_APP_ID));
        token.changeController(tokenManager);
        tokenManager.initialize(token, transferable, maxAccountTokens);
        return tokenManager;
    }

    function _createTokenManagerPermissions(ACL acl, TokenManager tokenManager, address grantee, address manager) internal {
        acl.createPermission(grantee, tokenManager, tokenManager.MINT_ROLE(), manager);
        acl.createPermission(grantee, tokenManager, tokenManager.ASSIGN_ROLE(), manager);
        acl.createPermission(grantee, tokenManager, tokenManager.REVOKE_VESTINGS_ROLE(), manager);
    }

    /* VAULT */

    function _installVaultApp(Kernel dao) internal returns (Vault) {
        Vault vault = Vault(_installDefaultApp(dao, VAULT_APP_ID));
        vault.initialize();
        return vault;
    }

    function _createVaultPermissions(ACL acl, Vault vault, address grantee, address manager) internal {
        acl.createPermission(grantee, vault, vault.TRANSFER_ROLE(), manager);
    }

    /* VOTING */

    function _installVotingApp(Kernel dao, MiniMeToken token, uint64 support, uint64 acceptance, uint64 duration) internal returns (Voting) {
        Voting voting = Voting(_installNonDefaultApp(dao, VOTING_APP_ID));
        voting.initialize(token, support, acceptance, duration);
        return voting;
    }

    function _createVotingPermissions(ACL acl, Voting voting, address grantee, address manager) internal {
        acl.createPermission(grantee, voting, voting.MODIFY_QUORUM_ROLE(), manager);
        acl.createPermission(grantee, voting, voting.MODIFY_SUPPORT_ROLE(), manager);
    }

    /* EVM SCRIPTS */

    function _createEvmScriptsRegistryPermissions(ACL acl, address grantee, address manager) internal {
        EVMScriptRegistry registry = EVMScriptRegistry(acl.getEVMScriptRegistry());
        acl.createPermission(grantee, registry, registry.REGISTRY_MANAGER_ROLE(), manager);
        acl.createPermission(grantee, registry, registry.REGISTRY_ADD_EXECUTOR_ROLE(), manager);
    }

    /* APPS */

    function _installNonDefaultApp(Kernel dao, bytes32 appId) internal returns (address) {
        return _installApp(dao, appId, new bytes(0), false);
    }

    function _installDefaultApp(Kernel dao, bytes32 appId) internal returns (address) {
        return _installApp(dao, appId, new bytes(0), true);
    }

    function _installApp(Kernel dao, bytes32 appId, bytes data, bool setDefault) internal returns (address) {
        address latestBaseAppAddress = _latestVersionAppBase(appId);
        address instance = address(dao.newAppInstance(appId, latestBaseAppAddress, data, setDefault));
        emit InstalledApp(instance, appId);
        return instance;
    }

    function _latestVersionAppBase(bytes32 appId) internal view returns (address base) {
        Repo repo = Repo(PublicResolver(ens.resolver(appId)).addr(appId));
        (,base,) = repo.getLatest();
    }

    /* TOKEN */

    function _createToken(string name, string symbol) internal returns (MiniMeToken) {
        require(isContract(address(miniMeFactory)), "TEMPLATE_MINIME_FACTORY_NOT_PROVIDED");
        MiniMeToken token = miniMeFactory.createCloneToken(MiniMeToken(address(0)), 0, name, 18, symbol, true);
        emit DeployToken(address(token));
        return token;
    }

    /* IDS */

    function _registerID(string name, address owner) internal {
        require(isContract(address(aragonID)), "TEMPLATE_ARAGON_ID_NOT_PROVIDED");
        aragonID.register(keccak256(abi.encodePacked(name)), owner);
    }
}
