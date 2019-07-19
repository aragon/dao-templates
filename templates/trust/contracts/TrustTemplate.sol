pragma solidity 0.4.24;

import "@aragon/os/contracts/acl/ACL.sol";
import "@aragon/os/contracts/kernel/Kernel.sol";
import "@aragon/os/contracts/factory/DAOFactory.sol";
import "@aragon/os/contracts/common/IsContract.sol";
import "@aragon/os/contracts/lib/math/SafeMath.sol";
import "@aragon/apps-agent/contracts/Agent.sol";
import "@aragon/apps-vault/contracts/Vault.sol";
import "@aragon/apps-voting/contracts/Voting.sol";
import "@aragon/apps-finance/contracts/Finance.sol";
import "@aragon/apps-token-manager/contracts/TokenManager.sol";
import "@aragon/apps-shared-minime/contracts/MiniMeToken.sol";
import "@aragon/templates-shared/contracts/BaseTemplate.sol";
import "@aragon/id/contracts/IFIFSResolvingRegistrar.sol";
import "./MultiSigWallet.sol";


contract TrustTemplate is BaseTemplate {
    using SafeMath for uint256;

    string constant private ERROR_BAD_HEIRS_LENGTH = "TRUST_BAD_HEIRS_LENGTH";
    string constant private ERROR_BAD_APP_IDS_LENGTH = "TRUST_BAD_APP_IDS_LENGTH";
    string constant private ERROR_BAD_MULTI_SIG_KEYS_LENGTH = "TRUST_BAD_MULTI_SIG_KEYS_LENGTH";
    string constant private ERROR_BAD_BENEFICIARY_KEYS_LENGTH = "TRUST_BAD_BENEFICIARY_KEY_LENGTH";
    string constant private ERROR_INVALID_HEIRS_STAKE = "TRUST_INVALID_HEIRS_STAKE";
    string constant private ERROR_REGISTRY_FACTORY_IS_NOT_CONTRACT = "TRUST_REGISTRY_FACT_NOT_CONTRACT";
    string constant private ERROR_MISSING_CACHE_TOKENS_FOR_SENDER = "TRUST_MISSING_SENDER_CACHE_TOKEN";

    uint256 constant private ONE_PCT = uint64(1e16);                            // 1%
    uint256 constant private BENEFICIARY_KEYS_AMOUNT = 2;                       // hold + cold keys
    uint256 constant private MULTI_SIG_EXTERNAL_KEYS_AMOUNT = 2;                // 2 external keys for the multis sig wallet
    uint256 constant private MULTI_SIG_REQUIRED_CONFIRMATIONS = 2;              // 2 out of 3 (keys + dao)

    string constant private HOLD_TOKEN_NAME = "Beneficiaries Token";
    string constant private HOLD_TOKEN_SYMBOL = "HOLD";
    uint64 constant private HOLD_VOTE_DURATION = uint64(7 days);                // 1 week
    uint64 constant private HOLD_SUPPORT_REQUIRED = uint64(100 * ONE_PCT - 1);  // 99.9999999999999999%
    uint64 constant private HOLD_MIN_ACCEPTANCE_QUORUM = uint64(0);             // 0%

    string constant private HEIRS_TOKEN_NAME = "Heirs Token";
    string constant private HEIRS_TOKEN_SYMBOL = "HEIRS";
    uint64 constant private HEIRS_VOTE_DURATION = uint64(365 days);             // 1 year
    uint64 constant private HEIRS_SUPPORT_REQUIRED = uint64(66 * ONE_PCT);      // 66%
    uint64 constant private HEIRS_MIN_ACCEPTANCE_QUORUM = uint64(0);            // 0%

    struct DaoCache {
        address dao;
        address holdToken;
        address heirsToken;
    }

    struct AppsCache {
        address agent;
        address holdVoting;
        address holdTokenManager;
        address heirsTokenManager;
    }

    mapping (address => DaoCache) internal daoCache;
    mapping (address => AppsCache) internal appsCache;

    event DeployMultiSig(address multiSig);

    constructor(DAOFactory _daoFactory, ENS _ens, MiniMeTokenFactory _miniMeFactory, IFIFSResolvingRegistrar _aragonID)
        BaseTemplate(_daoFactory, _ens, _miniMeFactory, _aragonID)
        public
    {
        // solium-disable-previous-line no-empty-blocks
    }

    function prepareDAO() public returns (Kernel) {
        (Kernel dao,) = _createDAO();
        MiniMeToken holdToken = _createToken(HOLD_TOKEN_NAME, HOLD_TOKEN_SYMBOL);
        MiniMeToken heirsToken = _createToken(HEIRS_TOKEN_NAME, HEIRS_TOKEN_SYMBOL);
        _storeDaoCache(msg.sender, dao, holdToken, heirsToken);
        return dao;
    }

    function setupDAO(string id, address[] beneficiaryKeys, address[] heirs, uint256[] heirsStake) public returns (Kernel) {
        require(_hasDaoCache(msg.sender), ERROR_MISSING_CACHE_TOKENS_FOR_SENDER);
        require(heirs.length == heirsStake.length, ERROR_BAD_HEIRS_LENGTH);
        require(beneficiaryKeys.length == BENEFICIARY_KEYS_AMOUNT, ERROR_BAD_BENEFICIARY_KEYS_LENGTH);
        uint256 blockedHeirsSupply = _calculateBlockedHeirsSupply(heirsStake);

        Kernel dao = _getDaoCache(msg.sender);
        _setupApps(dao, beneficiaryKeys, heirs, heirsStake, blockedHeirsSupply);
        _registerID(id, address(dao));
        return dao;
    }

    function setupMultiSig(address[] multiSigKeys) public returns (MultiSigWallet) {
        require(_hasDaoCache(msg.sender) && _hasAppsCache(msg.sender), ERROR_MISSING_CACHE_TOKENS_FOR_SENDER);
        require(multiSigKeys.length == MULTI_SIG_EXTERNAL_KEYS_AMOUNT, ERROR_BAD_MULTI_SIG_KEYS_LENGTH);

        Kernel dao = _getDaoCache(msg.sender);
        MultiSigWallet multiSig = _setupMultiSig(dao, multiSigKeys);
        emit DeployMultiSig(address(multiSig));
        return multiSig;
    }

    function _setupApps(Kernel dao, address[] beneficiaryKeys, address[] heirs, uint256[] heirsStake, uint256 blockedHeirsSupply) internal {
        ACL acl = ACL(dao.acl());
        Agent agent = _installNonDefaultAgentApp(dao);
        Vault vault = _installVaultApp(dao);
        Finance finance = _installFinanceApp(dao, vault, 30 days);
        (Voting holdVoting, Voting heirsVoting, TokenManager holdTokenManager, TokenManager heirsTokenManager) = _installTokenApps(dao);

        _mintHoldTokens(acl, holdTokenManager, beneficiaryKeys);
        _mintHeirsTokens(acl, heirsTokenManager, heirs, heirsStake, blockedHeirsSupply);

        _createVaultPermissions(acl, vault, finance, holdVoting);
        _createFinancePermissions(acl, finance, holdVoting, holdVoting);
        _createTokenManagerPermissions(acl, holdTokenManager, holdVoting);
        _createTokenManagerPermissions(acl, heirsTokenManager, heirsVoting);
        _createEvmScriptsRegistryPermissions(acl, holdVoting, holdVoting);
        _createVotingPermissions(acl, holdTokenManager, holdVoting);
        _createVotingPermissions(acl, heirsTokenManager, heirsVoting);
        _createAgentPermission(acl, agent, agent.EXECUTE_ROLE(), holdVoting, heirsVoting);
        _createAgentPermission(acl, agent, agent.RUN_SCRIPT_ROLE(), holdVoting, heirsVoting);

        _storeAppsCache(msg.sender, agent, holdVoting, holdTokenManager, heirsTokenManager);
    }

    function _setupMultiSig(Kernel dao, address[] multiSigKeys) internal returns (MultiSigWallet) {
        ACL acl = ACL(dao.acl());

        (Agent agent, Voting holdVoting, TokenManager holdTokenManager, TokenManager heirsTokenManager) = _getAppsCache(msg.sender);
        MultiSigWallet multiSig = _createMultiSig(multiSigKeys, agent);
        _createMultiSigPermissions(acl, multiSig, holdTokenManager, heirsTokenManager);
        _transferPermissionFromTemplate(acl, holdVoting, dao, dao.APP_MANAGER_ROLE());
        _transferPermissionFromTemplate(acl, holdVoting, acl, acl.CREATE_PERMISSIONS_ROLE());
        _cleanCache(msg.sender);
        return multiSig;
    }

    function _createMultiSig(address[] multiSigKeys, Agent agent) internal returns (MultiSigWallet) {
        address[] memory multiSigOwners = new address[](3);
        multiSigOwners[0] = multiSigKeys[0];
        multiSigOwners[1] = multiSigKeys[1];
        multiSigOwners[2] = address(agent);
        return new MultiSigWallet(multiSigOwners, MULTI_SIG_REQUIRED_CONFIRMATIONS);
    }

    function _installTokenApps(Kernel dao)
        internal
        returns (Voting holdVoting, Voting heirsVoting, TokenManager holdTokenManager, TokenManager heirsTokenManager)
    {
        (MiniMeToken holdToken, MiniMeToken heirsToken) = _getTokensCache(msg.sender);

        holdVoting = _installVotingApp(dao, holdToken, HOLD_SUPPORT_REQUIRED, HOLD_MIN_ACCEPTANCE_QUORUM, HOLD_VOTE_DURATION);
        heirsVoting = _installVotingApp(dao, heirsToken, HEIRS_SUPPORT_REQUIRED, HEIRS_MIN_ACCEPTANCE_QUORUM, HEIRS_VOTE_DURATION);
        holdTokenManager = _installTokenManagerApp(dao, holdToken, true, uint256(-1));
        heirsTokenManager = _installTokenManagerApp(dao, heirsToken, true, uint256(-1));
    }

    function _mintHoldTokens(ACL acl, TokenManager holdTokenManager, address[] beneficiaryKeys) internal {
        _createPermissionForTemplate(acl, holdTokenManager, holdTokenManager.MINT_ROLE());
        holdTokenManager.mint(beneficiaryKeys[0], 1e18);
        holdTokenManager.mint(beneficiaryKeys[1], 1e18);
        _removePermissionFromTemplate(acl, holdTokenManager, holdTokenManager.MINT_ROLE());
    }

    function _mintHeirsTokens(ACL acl, TokenManager heirsTokenManager, address[] heirs, uint256[] heirsStake, uint256 blockedHeirsSupply)
        internal
    {
        _createPermissionForTemplate(acl, heirsTokenManager, heirsTokenManager.MINT_ROLE());
        heirsTokenManager.mint(address(0), blockedHeirsSupply);
        for (uint256 i = 0; i < heirs.length; i++) {
            heirsTokenManager.mint(heirs[i], heirsStake[i]);
        }
        _removePermissionFromTemplate(acl, heirsTokenManager, heirsTokenManager.MINT_ROLE());
    }

    function _createAgentPermission(ACL acl, Agent agent, bytes32 permission, Voting holdVoting, Voting heirsVoting) internal {
        acl.createPermission(holdVoting, agent, permission, address(this));
        acl.grantPermission(heirsVoting, agent, permission);
        acl.revokePermission(address(this), agent, permission);
        acl.setPermissionManager(holdVoting, agent, permission);
    }

    function _createTokenManagerPermissions(ACL acl, TokenManager tokenManager, Voting voting) internal {
        acl.createPermission(voting, tokenManager, tokenManager.ASSIGN_ROLE(), voting);
        acl.createPermission(voting, tokenManager, tokenManager.REVOKE_VESTINGS_ROLE(), voting);
    }

    function _createVotingPermissions(ACL acl, TokenManager tokenManager, Voting voting) internal {
        acl.createPermission(tokenManager, voting, voting.CREATE_VOTES_ROLE(), voting);
        acl.createPermission(voting, voting, voting.MODIFY_QUORUM_ROLE(), voting);
        acl.createPermission(voting, voting, voting.MODIFY_SUPPORT_ROLE(), voting);
    }

    function _createMultiSigPermissions(ACL acl, MultiSigWallet multiSig, TokenManager holdTokenManager, TokenManager heirsTokenManager)
        internal
    {
         acl.createPermission(multiSig, holdTokenManager, holdTokenManager.BURN_ROLE(), multiSig);
         acl.createPermission(multiSig, holdTokenManager, holdTokenManager.MINT_ROLE(), multiSig);
         acl.createPermission(multiSig, heirsTokenManager, heirsTokenManager.BURN_ROLE(), multiSig);
         acl.createPermission(multiSig, heirsTokenManager, heirsTokenManager.MINT_ROLE(), multiSig);
    }

    function _storeDaoCache(address owner, Kernel dao, MiniMeToken holdToken, MiniMeToken heirsToken) internal {
        daoCache[owner] = DaoCache({ dao: dao, holdToken: holdToken, heirsToken: heirsToken });
    }

    function _hasDaoCache(address owner) internal view returns (bool) {
        DaoCache storage c = daoCache[owner];
        return c.dao != address(0) && c.holdToken != address(0) && c.heirsToken != address(0);
    }

    function _hasAppsCache(address owner) internal view returns (bool) {
        AppsCache storage c = appsCache[owner];
        return c.agent != address(0) && c.holdVoting != address(0) && c.holdTokenManager != address(0) && c.heirsTokenManager != address(0);
    }

    function _storeAppsCache(address owner, Agent agent, Voting holdVoting, TokenManager holdTokenManager, TokenManager heirsTokenManager)
        internal
    {
        appsCache[owner] = AppsCache({
            agent: agent,
            holdVoting: holdVoting,
            holdTokenManager: holdTokenManager,
            heirsTokenManager: heirsTokenManager
        });
    }

    function _cleanCache(address owner) internal {
        delete daoCache[owner];
        delete appsCache[owner];
    }

    function _getDaoCache(address owner) internal view returns (Kernel) {
        return Kernel(daoCache[owner].dao);
    }

    function _getTokensCache(address owner) internal view returns (MiniMeToken holdToken, MiniMeToken heirsToken) {
        DaoCache storage c = daoCache[owner];
        holdToken = MiniMeToken(c.holdToken);
        heirsToken = MiniMeToken(c.heirsToken);
    }

    function _getAppsCache(address owner) internal view
        returns (Agent agent, Voting holdVoting, TokenManager holdTokenManager, TokenManager heirsTokenManager)
    {
        AppsCache storage c = appsCache[owner];
        agent = Agent(c.agent);
        holdVoting = Voting(c.holdVoting);
        holdTokenManager = TokenManager(c.holdTokenManager);
        heirsTokenManager = TokenManager(c.heirsTokenManager);
    }

    function _calculateBlockedHeirsSupply(uint256[] heirsStake) internal pure returns (uint256) {
        uint256 totalHeirsSupply = 0;
        for (uint256 i = 0; i < heirsStake.length; i++) {
            totalHeirsSupply = totalHeirsSupply.add(heirsStake[i]);
        }
        uint256 support = HEIRS_SUPPORT_REQUIRED / ONE_PCT;
        require(totalHeirsSupply.mul(100) % support == 0, ERROR_INVALID_HEIRS_STAKE);
        uint256 totalSupply = totalHeirsSupply.mul(100).div(support);
        uint256 blockedSupply = totalSupply.sub(totalHeirsSupply);
        return blockedSupply;
    }
}
