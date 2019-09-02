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
import "./MultiSigWallet.sol";


contract TrustTemplate is BaseTemplate {
    using SafeMath for uint256;

    string constant private ERROR_BAD_HEIRS_LENGTH = "TRUST_BAD_HEIRS_LENGTH";
    string constant private ERROR_BAD_APP_IDS_LENGTH = "TRUST_BAD_APP_IDS_LENGTH";
    string constant private ERROR_BAD_MULTI_SIG_KEYS_LENGTH = "TRUST_BAD_MULTI_SIG_KEYS_LENGTH";
    string constant private ERROR_BAD_BENEFICIARY_KEYS_LENGTH = "TRUST_BAD_BENEFICIARY_KEY_LENGTH";
    string constant private ERROR_INVALID_HEIRS_STAKE = "TRUST_INVALID_HEIRS_STAKE";
    string constant private ERROR_REGISTRY_FACTORY_IS_NOT_CONTRACT = "TRUST_REGISTRY_FACT_NOT_CONTRACT";
    string constant private ERROR_MISSING_SENDER_CACHE = "TRUST_MISSING_SENDER_CACHE";

    uint256 constant private ONE_PCT = uint64(1e16);                            // 1%
    uint256 constant private BENEFICIARY_KEYS_AMOUNT = 2;                       // hold + cold keys
    uint256 constant private MULTI_SIG_EXTERNAL_KEYS_AMOUNT = 2;                // 2 external keys for the multis sig wallet
    uint256 constant private MULTI_SIG_REQUIRED_CONFIRMATIONS = 2;              // 2 out of 3 (keys + dao)

    bool constant private HOLD_TOKEN_TRANSFERABLE = true;
    string constant private HOLD_TOKEN_NAME = "Beneficiaries Token";
    string constant private HOLD_TOKEN_SYMBOL = "HOLD";
    uint8 constant private HOLD_TOKEN_DECIMALS = 18;
    uint256 constant private HOLD_TOKEN_MAX_PER_ACCOUNT = uint256(0);           // no limit of tokens per account

    uint64 constant private HOLD_VOTE_DURATION = uint64(7 days);                // 1 week
    uint64 constant private HOLD_SUPPORT_REQUIRED = uint64(100 * ONE_PCT - 1);  // 99.9999999999999999%
    uint64 constant private HOLD_MIN_ACCEPTANCE_QUORUM = uint64(0);             // 0%

    bool constant private HEIRS_TOKEN_TRANSFERABLE = true;
    string constant private HEIRS_TOKEN_NAME = "Heirs Token";
    string constant private HEIRS_TOKEN_SYMBOL = "HEIRS";
    uint8 constant private HEIRS_TOKEN_DECIMALS = 18;
    uint256 constant private HEIRS_TOKEN_MAX_PER_ACCOUNT = uint256(0);          // no limit of tokens per account

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
        _ensureAragonIdIsValid(_aragonID);
        _ensureMiniMeFactoryIsValid(_miniMeFactory);
    }

    function prepareInstance() public returns (Kernel) {
        (Kernel dao,) = _createDAO();
        MiniMeToken holdToken = _createToken(HOLD_TOKEN_NAME, HOLD_TOKEN_SYMBOL, HOLD_TOKEN_DECIMALS);
        MiniMeToken heirsToken = _createToken(HEIRS_TOKEN_NAME, HEIRS_TOKEN_SYMBOL, HEIRS_TOKEN_DECIMALS);
        _storeDaoCache(msg.sender, dao, holdToken, heirsToken);
        return dao;
    }

    function setupInstance(
        string memory _id,
        address[] memory _beneficiaryKeys,
        address[] memory _heirs,
        uint256[] memory _heirsStakes
    )
        public
        returns (Kernel)
    {
        _validateId(_id);
        require(_hasDaoCache(msg.sender), ERROR_MISSING_SENDER_CACHE);
        require(_heirs.length == _heirsStakes.length, ERROR_BAD_HEIRS_LENGTH);
        require(_beneficiaryKeys.length == BENEFICIARY_KEYS_AMOUNT, ERROR_BAD_BENEFICIARY_KEYS_LENGTH);
        uint256 blockedHeirsSupply = _calculateBlockedHeirsSupply(_heirsStakes);

        Kernel dao = _getDaoCache(msg.sender);
        _setupApps(dao, _beneficiaryKeys, _heirs, _heirsStakes, blockedHeirsSupply);
        _registerID(_id, address(dao));
        return dao;
    }

    function setupMultiSig(address[] memory _multiSigKeys) public returns (MultiSigWallet) {
        require(_hasDaoCache(msg.sender) && _hasAppsCache(msg.sender), ERROR_MISSING_SENDER_CACHE);
        require(_multiSigKeys.length == MULTI_SIG_EXTERNAL_KEYS_AMOUNT, ERROR_BAD_MULTI_SIG_KEYS_LENGTH);

        Kernel dao = _getDaoCache(msg.sender);
        MultiSigWallet multiSig = _setupMultiSig(dao, _multiSigKeys);
        emit DeployMultiSig(address(multiSig));
        return multiSig;
    }

    function _setupApps(
        Kernel _dao,
        address[] memory _beneficiaryKeys,
        address[] memory _heirs,
        uint256[] memory _heirsStakes,
        uint256 _blockedHeirsSupply
    )
        internal
    {
        // Install apps
        ACL acl = ACL(_dao.acl());
        Vault vault = _installVaultApp(_dao);
        Agent agent = _installNonDefaultAgentApp(_dao);
        Finance finance = _installFinanceApp(_dao, vault, 30 days);
        (Voting holdVoting, Voting heirsVoting, TokenManager holdTokenManager, TokenManager heirsTokenManager) = _installTokenApps(_dao);

        // Mint tokens
        _mintTokens(acl, holdTokenManager, _beneficiaryKeys, 1e18);
        _mintTokens(acl, heirsTokenManager, _heirs, _heirsStakes);
        _mintTokens(acl, heirsTokenManager, address(0), _blockedHeirsSupply);

        // Set up permissions
        _createVaultPermissions(acl, vault, finance, holdVoting);
        _createFinancePermissions(acl, finance, holdVoting, holdVoting);
        _createFinanceCreatePaymentsPermission(acl, finance, holdVoting, holdVoting);
        _createEvmScriptsRegistryPermissions(acl, holdVoting, holdVoting);
        _createCustomAgentPermissions(acl, agent, holdVoting, heirsVoting);
        _createCustomVotingPermissions(acl, holdTokenManager, holdVoting);
        _createCustomVotingPermissions(acl, heirsTokenManager, heirsVoting);
        _createCustomTokenManagerPermissions(acl, holdTokenManager, holdVoting);
        _createCustomTokenManagerPermissions(acl, heirsTokenManager, heirsVoting);

        _storeAppsCache(msg.sender, agent, holdVoting, holdTokenManager, heirsTokenManager);
    }

    function _setupMultiSig(Kernel _dao, address[] memory _multiSigKeys) internal returns (MultiSigWallet) {
        ACL acl = ACL(_dao.acl());

        (Agent agent, Voting holdVoting, TokenManager holdTokenManager, TokenManager heirsTokenManager) = _getAppsCache(msg.sender);
        MultiSigWallet multiSig = _createMultiSig(_multiSigKeys, agent);
        _createMultiSigPermissions(acl, multiSig, holdTokenManager, heirsTokenManager);
        _transferRootPermissionsFromTemplateAndFinalizeDAO(_dao, holdVoting);
        _cleanCache(msg.sender);
        return multiSig;
    }

    function _createMultiSig(address[] memory _multiSigKeys, Agent _agent) internal returns (MultiSigWallet) {
        address[] memory multiSigOwners = new address[](3);
        multiSigOwners[0] = _multiSigKeys[0];
        multiSigOwners[1] = _multiSigKeys[1];
        multiSigOwners[2] = address(_agent);
        return new MultiSigWallet(multiSigOwners, MULTI_SIG_REQUIRED_CONFIRMATIONS);
    }

    function _installTokenApps(Kernel _dao)
        internal
        returns (Voting holdVoting, Voting heirsVoting, TokenManager holdTokenManager, TokenManager heirsTokenManager)
    {
        (MiniMeToken holdToken, MiniMeToken heirsToken) = _getTokensCache(msg.sender);

        holdVoting = _installVotingApp(_dao, holdToken, HOLD_SUPPORT_REQUIRED, HOLD_MIN_ACCEPTANCE_QUORUM, HOLD_VOTE_DURATION);
        heirsVoting = _installVotingApp(_dao, heirsToken, HEIRS_SUPPORT_REQUIRED, HEIRS_MIN_ACCEPTANCE_QUORUM, HEIRS_VOTE_DURATION);
        holdTokenManager = _installTokenManagerApp(_dao, holdToken, HOLD_TOKEN_TRANSFERABLE, HOLD_TOKEN_MAX_PER_ACCOUNT);
        heirsTokenManager = _installTokenManagerApp(_dao, heirsToken, HEIRS_TOKEN_TRANSFERABLE, HEIRS_TOKEN_MAX_PER_ACCOUNT);
    }

    function _createCustomAgentPermissions(ACL _acl, Agent _agent, Voting _holdVoting, Voting _heirsVoting) internal {
        address[] memory grantees = new address[](2);
        grantees[0] = address(_holdVoting);
        grantees[1] = address(_heirsVoting);

        _createPermissions(_acl, grantees, _agent, _agent.EXECUTE_ROLE(), _holdVoting);
        _createPermissions(_acl, grantees, _agent, _agent.RUN_SCRIPT_ROLE(), _holdVoting);
    }

    function _createCustomTokenManagerPermissions(ACL _acl, TokenManager _tokenManager, Voting _voting) internal {
        _acl.createPermission(_voting, _tokenManager, _tokenManager.ASSIGN_ROLE(), _voting);
        _acl.createPermission(_voting, _tokenManager, _tokenManager.REVOKE_VESTINGS_ROLE(), _voting);
    }

    function _createCustomVotingPermissions(ACL _acl, TokenManager _tokenManager, Voting _voting) internal {
        _acl.createPermission(_tokenManager, _voting, _voting.CREATE_VOTES_ROLE(), _voting);
        _acl.createPermission(_voting, _voting, _voting.MODIFY_QUORUM_ROLE(), _voting);
        _acl.createPermission(_voting, _voting, _voting.MODIFY_SUPPORT_ROLE(), _voting);
    }

    function _createMultiSigPermissions(ACL _acl, MultiSigWallet _multiSig, TokenManager _holdTokenManager, TokenManager _heirsTokenManager)
        internal
    {
        _acl.createPermission(_multiSig, _holdTokenManager, _holdTokenManager.BURN_ROLE(), _multiSig);
        _acl.createPermission(_multiSig, _holdTokenManager, _holdTokenManager.MINT_ROLE(), _multiSig);
        _acl.createPermission(_multiSig, _heirsTokenManager, _heirsTokenManager.BURN_ROLE(), _multiSig);
        _acl.createPermission(_multiSig, _heirsTokenManager, _heirsTokenManager.MINT_ROLE(), _multiSig);
    }

    function _storeDaoCache(address _owner, Kernel _dao, MiniMeToken _holdToken, MiniMeToken _heirsToken) internal {
        daoCache[_owner] = DaoCache({ dao: _dao, holdToken: _holdToken, heirsToken: _heirsToken });
    }

    function _storeAppsCache(address _owner, Agent _agent, Voting _holdVoting, TokenManager _holdTokenManager, TokenManager _heirsTokenManager)
        internal
    {
        appsCache[_owner] = AppsCache({
            agent: _agent,
            holdVoting: _holdVoting,
            holdTokenManager: _holdTokenManager,
            heirsTokenManager: _heirsTokenManager
        });
    }

    function _cleanCache(address _owner) internal {
        delete daoCache[_owner];
        delete appsCache[_owner];
    }

    function _hasDaoCache(address _owner) internal view returns (bool) {
        DaoCache storage c = daoCache[_owner];
        return c.dao != address(0) && c.holdToken != address(0) && c.heirsToken != address(0);
    }

    function _hasAppsCache(address _owner) internal view returns (bool) {
        AppsCache storage c = appsCache[_owner];
        return c.agent != address(0) && c.holdVoting != address(0) && c.holdTokenManager != address(0) && c.heirsTokenManager != address(0);
    }

    function _getDaoCache(address _owner) internal view returns (Kernel) {
        return Kernel(daoCache[_owner].dao);
    }

    function _getTokensCache(address _owner) internal view returns (MiniMeToken holdToken, MiniMeToken heirsToken) {
        DaoCache storage c = daoCache[_owner];
        holdToken = MiniMeToken(c.holdToken);
        heirsToken = MiniMeToken(c.heirsToken);
    }

    function _getAppsCache(address _owner) internal view
        returns (Agent agent, Voting holdVoting, TokenManager holdTokenManager, TokenManager heirsTokenManager)
    {
        AppsCache storage c = appsCache[_owner];
        agent = Agent(c.agent);
        holdVoting = Voting(c.holdVoting);
        holdTokenManager = TokenManager(c.holdTokenManager);
        heirsTokenManager = TokenManager(c.heirsTokenManager);
    }

    function _calculateBlockedHeirsSupply(uint256[] memory _heirsStakes) internal pure returns (uint256) {
        uint256 totalHeirsSupply = 0;
        for (uint256 i = 0; i < _heirsStakes.length; i++) {
            totalHeirsSupply = totalHeirsSupply.add(_heirsStakes[i]);
        }
        uint256 support = HEIRS_SUPPORT_REQUIRED / ONE_PCT;
        require(totalHeirsSupply.mul(100) % support == 0, ERROR_INVALID_HEIRS_STAKE);
        uint256 totalSupply = totalHeirsSupply.mul(100).div(support);
        uint256 blockedSupply = totalSupply.sub(totalHeirsSupply);
        return blockedSupply;
    }
}
