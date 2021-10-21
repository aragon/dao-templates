pragma solidity 0.4.24;

import "@aragon/templates-shared/contracts/BaseTemplate.sol";

import "@1hive/apps-redemptions/contracts/Redemptions.sol";
import "@1hive/apps-time-lock/contracts/TimeLock.sol";
import "@1hive/apps-token-request/contracts/TokenRequest.sol";
import "@1hive/apps-dandelion-voting/contracts/DandelionVoting.sol";
import "@1hive/oracle-token-balance/contracts/TokenBalanceOracle.sol";

import "openzeppelin-solidity/contracts/token/ERC20/ERC20Detailed.sol";


contract DandelionOrg is BaseTemplate {
    string constant private ERROR_EMPTY_HOLDERS = "DANDELION_EMPTY_HOLDERS";
    string constant private ERROR_BAD_HOLDERS_STAKES_LEN = "DANDELION_BAD_HOLDERS_STAKES_LEN";
    string constant private ERROR_MISSING_DAO_CONTRACT = "DANDELION_MISSING_DAO_CONTRACT";
    string constant private ERROR_MISSING_FINANCE_CONTRACT = "DANDELION_MISSING_FINANCE_CONTRACT";
    string constant private ERROR_MISSING_TOKEN_MANAGER_CONTRACT = "DANDELION_MISSING_TOKEN_MANAGER_CONTRACT";
    string constant private ERROR_MISSING_VAULT_CONTRACT = "DANDELION_MISSING_VAULT_CONTRACT";
    string constant private ERROR_MISSING_TOKEN_CONTRACT = "DANDELION_MISSING_TOKEN_CONTRACT";
    string constant private ERROR_BAD_TOKENREQUEST_TOKEN_LIST = "DANDELION_BAD_TOKENREQUEST_TOKEN_LIST";
    string constant private ERROR_TIMELOCK_TOKEN_NOT_CONTRACT = "DANDELION_TIMELOCK_TOKEN_NOT_CONTRACT";

    bool constant private TOKEN_TRANSFERABLE = false;
    uint8 constant private TOKEN_DECIMALS = uint8(18);
    uint256 constant private TOKEN_MAX_PER_ACCOUNT = uint256(0);
    uint64 constant private DEFAULT_FINANCE_PERIOD = uint64(30 days);

    bytes32 constant private DANDELION_VOTING_APP_ID = apmNamehash("dandelion-voting");
    bytes32 constant private REDEMPTIONS_APP_ID = apmNamehash("redemptions");
    bytes32 constant private TIME_LOCK_APP_ID = apmNamehash("time-lock");
    bytes32 constant private TOKEN_REQUEST_APP_ID = apmNamehash("token-request");
    bytes32 constant private TOKEN_BALANCE_ORACLE_APP_ID = apmNamehash("token-balance-oracle");

    address constant ANY_ENTITY = address(-1);
    uint8 constant ORACLE_PARAM_ID = 203;
    enum Op { NONE, EQ, NEQ, GT, LT, GTE, LTE, RET, NOT, AND, OR, XOR, IF_ELSE }

    struct DeployedContracts {
        address dao;
        address token;
        address finance;
        address tokenManager;
        address agentOrVault;
        bool agentAsVault;
    }

    mapping (address => DeployedContracts) internal deployedContracts;

    constructor(DAOFactory _daoFactory, ENS _ens, MiniMeTokenFactory _miniMeFactory, IFIFSResolvingRegistrar _aragonID)
        BaseTemplate(_daoFactory, _ens, _miniMeFactory, _aragonID)
        public
    {
        _ensureAragonIdIsValid(_aragonID);
        _ensureMiniMeFactoryIsValid(_miniMeFactory);
    }

    /**
    * @dev Create a new MiniMe token and deploy a Dandelion Org DAO
    *      to be setup due to gas limits.
    * @param _tokenName String with the name for the token used by share holders in the organization
    * @param _tokenSymbol String with the symbol for the token used by share holders in the organization
    * @param _holders Array of token holder addresses
    * @param _stakes Array of token stakes for holders (token has 18 decimals, multiply token amount `* 10^18`)
    * @param _useAgentAsVault Boolean to tell whether to use an Agent app as a more advanced form of Vault app
    */
    function newTokenAndBaseInstance(
        string _tokenName,
        string _tokenSymbol,
        address[] _holders,
        uint256[] _stakes,
        uint64 _financePeriod,
        bool _useAgentAsVault
    )
        external
    {
        newToken(_tokenName, _tokenSymbol);
        newBaseInstance(_holders, _stakes, _financePeriod, _useAgentAsVault);
    }

    /**
    * @dev Install the Dandelion set of apps
    * @param _id String with the name for org, will assign `[id].aragonid.eth`
    * @param _redemptionsRedeemableTokens address[] with the list of redeemable tokens for redemptions app
    * @param _tokenRequestAcceptedDepositTokens address[] with the list of accepted deposit tokens for token request
    * @param _timeLockToken Address of the token for the lock app`
    * @param _timeLockSettings Array of [_lockDuration, _lockAmount, _spamPenaltyFactor] to set up the timeLock app of the organization
    * @param _votingSettings Array of [supportRequired, minAcceptanceQuorum, voteDuration, voteBuffer, voteDelay] to set up the voting app of the organization
    */
    function installDandelionApps(
        string _id,
        address[] _redemptionsRedeemableTokens,
        address[] _tokenRequestAcceptedDepositTokens,
        address _timeLockToken,
        uint256[3] _timeLockSettings,
        uint64[5] _votingSettings
    )
        external
    {
        _validateId(_id);
        _ensureDandelionSettings(_tokenRequestAcceptedDepositTokens, _timeLockToken);
        _ensureBaseAppsDeployed();

        Kernel dao = _getDao();
        ACL acl = ACL(dao.acl());
        bool agentAsVault = _getAgentAsVault();

        (DandelionVoting dandelionVoting, Redemptions redemptions, TokenRequest tokenRequest) = _installDandelionApps(
            dao,
            acl,
            _redemptionsRedeemableTokens,
            _tokenRequestAcceptedDepositTokens,
            _timeLockToken,
            _timeLockSettings,
            _votingSettings
        );

        _setupBasePermissions(acl, agentAsVault, dandelionVoting, redemptions, tokenRequest);

        _createEvmScriptsRegistryPermissions(acl, dandelionVoting, dandelionVoting);
        _transferRootPermissionsFromTemplateAndFinalizeDAO(dao, dandelionVoting);
        _registerID(_id, address(dao));
        _clearDeployedContracts();
    }

    /**
    * @dev Create a new MiniMe token and save it for the user
    * @param _name String with the name for the token used by share holders in the organization
    * @param _symbol String with the symbol for the token used by share holders in the organization
    */
    function newToken(string memory _name, string memory _symbol) internal returns (MiniMeToken) {
        MiniMeToken token = _createToken(_name, _symbol, TOKEN_DECIMALS);
        _saveToken(token);
        return token;
    }

    /**
    * @dev Deploy a Dandelion Org DAO using a previously saved MiniMe token
    * @param _holders Array of token holder addresses
    * @param _stakes Array of token stakes for holders (token has 18 decimals, multiply token amount `* 10^18`)
    * @param _useAgentAsVault Boolean to tell whether to use an Agent app as a more advanced form of Vault app
    */
    function newBaseInstance(
        address[] memory _holders,
        uint256[] memory _stakes,
        uint64 _financePeriod,
        bool _useAgentAsVault
    )
        internal
    {
        _ensureBaseSettings(_holders, _stakes);

        (Kernel dao, ACL acl) = _createDAO();
        _setupBaseApps(dao, acl, _holders, _stakes, _financePeriod, _useAgentAsVault);
    }

    function _setupBaseApps(
        Kernel _dao,
        ACL _acl,
        address[] memory _holders,
        uint256[] memory _stakes,
        uint64 _financePeriod,
        bool _useAgentAsVault
    )
        internal
    {
        MiniMeToken token = _getToken();
        Vault agentOrVault = _useAgentAsVault ? _installDefaultAgentApp(_dao) : _installVaultApp(_dao);
        TokenManager tokenManager = _installTokenManagerApp(_dao, token, TOKEN_TRANSFERABLE, TOKEN_MAX_PER_ACCOUNT);
        Finance finance = _installFinanceApp(_dao, agentOrVault, _financePeriod == 0 ? DEFAULT_FINANCE_PERIOD : _financePeriod);

        _mintTokens(_acl, tokenManager, _holders, _stakes);
        _saveBaseApps(_dao, finance, tokenManager, agentOrVault);
        _saveAgentAsVault(_dao, _useAgentAsVault);

    }

    function _installDandelionApps(
        Kernel _dao,
        ACL _acl,
        address[] memory _redemptionsRedeemableTokens,
        address[] memory _tokenRequestAcceptedDepositTokens,
        address _timeLockToken,
        uint256[3] memory _timeLockSettings,
        uint64[5] _votingSettings
    )
        internal returns (DandelionVoting, Redemptions, TokenRequest)
    {
        DandelionVoting dandelionVoting = _installDandelionVotingApp(_dao, _votingSettings);
        Redemptions redemptions = _installRedemptionsApp(_dao, _redemptionsRedeemableTokens);
        TokenRequest tokenRequest = _installTokenRequestApp(_dao, _tokenRequestAcceptedDepositTokens);
        TimeLock timeLock = _installTimeLockApp(_dao, _timeLockToken, _timeLockSettings);
        TokenBalanceOracle tokenBalanceOracle = _installTokenBalanceOracle(_dao);

        _setupDandelionPermissions(_acl, dandelionVoting, redemptions, tokenRequest, timeLock, tokenBalanceOracle);

        // Return apps that will be granted base app permissions
        return (dandelionVoting, redemptions, tokenRequest);
    }

    /* DANDELION VOTING */

    function _installDandelionVotingApp(Kernel _dao, uint64[5] memory _votingSettings) internal returns (DandelionVoting) {
        MiniMeToken token = _getToken();
        return _installDandelionVotingApp(_dao, token, _votingSettings[0], _votingSettings[1], _votingSettings[2], _votingSettings[3], _votingSettings[4]);
    }

    function _installDandelionVotingApp(
        Kernel _dao,
        MiniMeToken _token,
        uint64 _support,
        uint64 _acceptance,
        uint64 _duration,
        uint64 _buffer,
        uint64 _delay
    )
        internal returns (DandelionVoting)
    {
        DandelionVoting dandelionVoting = DandelionVoting(_registerApp(_dao, DANDELION_VOTING_APP_ID));
        dandelionVoting.initialize(_token, _support, _acceptance, _duration, _buffer, _delay);

        return dandelionVoting;
    }

    function _createDandelionVotingPermissions(
        ACL _acl,
        DandelionVoting _dandelionVoting,
        address _settingsGrantee,
        address _createVotesGrantee,
        address _manager
    )
        internal
    {
        _acl.createPermission(_settingsGrantee, _dandelionVoting, _dandelionVoting.MODIFY_SUPPORT_ROLE(), _manager);
        _acl.createPermission(_settingsGrantee, _dandelionVoting, _dandelionVoting.MODIFY_QUORUM_ROLE(), _manager);
        _acl.createPermission(_settingsGrantee, _dandelionVoting, _dandelionVoting.MODIFY_BUFFER_BLOCKS_ROLE(), _manager);
        _acl.createPermission(_settingsGrantee, _dandelionVoting, _dandelionVoting.MODIFY_EXECUTION_DELAY_ROLE(), _manager);
        _acl.createPermission(_createVotesGrantee, _dandelionVoting, _dandelionVoting.CREATE_VOTES_ROLE(), _manager);
    }

    /* REDEMPTIONS */

    function _installRedemptionsApp(Kernel _dao, address[] memory _redemptionsRedeemableTokens) internal returns (Redemptions) {

        (, TokenManager tokenManager, Vault vault) = _getBaseApps();
        Redemptions redemptions = Redemptions(_registerApp(_dao, REDEMPTIONS_APP_ID));
        redemptions.initialize(vault, tokenManager, _redemptionsRedeemableTokens);
        return redemptions;
    }

    function _createRedemptionsPermissions(
        ACL _acl,
        Redemptions _redemptions,
        address _grantee,
        address _manager,
        address _dissentOracle
    )
        internal
    {

        _acl.createPermission(_grantee, _redemptions, _redemptions.ADD_TOKEN_ROLE(), _manager);
        _acl.createPermission(_grantee, _redemptions, _redemptions.REMOVE_TOKEN_ROLE(), _manager);
        _acl.createPermission(ANY_ENTITY, _redemptions, _redemptions.REDEEM_ROLE(), address(this));
        _setOracle(_acl, ANY_ENTITY, _redemptions, _redemptions.REDEEM_ROLE(), _dissentOracle);

        //change manager
        _acl.setPermissionManager(_manager, _redemptions, _redemptions.REDEEM_ROLE());
    }

    /* TOKEN REQUEST */

    function _installTokenRequestApp(Kernel _dao, address[] memory _tokenRequestAcceptedDepositTokens) internal returns (TokenRequest) {

        (, TokenManager tokenManager, Vault vault) = _getBaseApps();
        TokenRequest tokenRequest = TokenRequest(_registerApp(_dao, TOKEN_REQUEST_APP_ID));
        tokenRequest.initialize(tokenManager, vault, _tokenRequestAcceptedDepositTokens);
        return tokenRequest;
    }

    function _createTokenRequestPermissions(
        ACL _acl,
        TokenRequest _tokenRequest,
        address _grantee,
        address _manager
    )
        internal
    {
        _acl.createPermission(_grantee, _tokenRequest, _tokenRequest.SET_TOKEN_MANAGER_ROLE(), _manager);
        _acl.createPermission(_grantee, _tokenRequest, _tokenRequest.SET_VAULT_ROLE(), _manager);
        _acl.createPermission(_grantee, _tokenRequest, _tokenRequest.MODIFY_TOKENS_ROLE(), _manager);
        _acl.createPermission(_grantee, _tokenRequest, _tokenRequest.FINALISE_TOKEN_REQUEST_ROLE(), _manager);
    }

    /* TIME LOCK */

    function _installTimeLockApp(Kernel _dao,  address _timeLockToken, uint256[3] memory _timeLockSettings) internal returns (TimeLock) {
        return _installTimeLockApp(_dao, _timeLockToken, _timeLockSettings[0], _timeLockSettings[1], _timeLockSettings[2]);
    }

    function _installTimeLockApp(
        Kernel _dao,
        address _timeLockToken,
        uint256 _lockDuration,
        uint256 _lockAmount,
        uint256 _spamPenaltyFactor
    )
        internal returns (TimeLock)
    {
        TimeLock timeLock = TimeLock(_registerApp(_dao, TIME_LOCK_APP_ID));
        uint256 adjustedAmount = _lockAmount * (10 ** uint256(ERC20Detailed(_timeLockToken).decimals()));
        timeLock.initialize(_timeLockToken, _lockDuration, adjustedAmount, _spamPenaltyFactor);
        return timeLock;
    }

    function _createTimeLockPermissions(
        ACL _acl,
        TimeLock _timeLock,
        address _grantee,
        address _manager,
        address _tokenBalanceOracle
    )
        internal
    {
        _acl.createPermission(_grantee, _timeLock, _timeLock.CHANGE_DURATION_ROLE(), _manager);
        _acl.createPermission(_grantee, _timeLock, _timeLock.CHANGE_AMOUNT_ROLE(), _manager);
        _acl.createPermission(_grantee, _timeLock, _timeLock.CHANGE_SPAM_PENALTY_ROLE(), _manager);
        _acl.createPermission(ANY_ENTITY, _timeLock, _timeLock.LOCK_TOKENS_ROLE(), address(this));
        _setOracle(_acl, ANY_ENTITY, _timeLock, _timeLock.LOCK_TOKENS_ROLE(), _tokenBalanceOracle);

        //change manager
        _acl.setPermissionManager(_manager, _timeLock, _timeLock.LOCK_TOKENS_ROLE());
    }

    /** TOKEN BALANCE ORACLE */

    function _installTokenBalanceOracle(Kernel _dao) internal returns (TokenBalanceOracle) {
        (, TokenManager tokenManager,) = _getBaseApps();
        TokenBalanceOracle oracle = TokenBalanceOracle(_registerApp(_dao, TOKEN_BALANCE_ORACLE_APP_ID));
        oracle.initialize(tokenManager.token(), 1 * (10 ** uint256(TOKEN_DECIMALS)));
        return oracle;
    }

    function _createTokenBalanceOraclePermissions(
        ACL _acl,
        TokenBalanceOracle _oracle,
        address _grantee,
        address _manager
    )
        internal
    {
        _acl.createPermission(_grantee, _oracle, _oracle.SET_TOKEN_ROLE(), _manager);
        _acl.createPermission(_grantee, _oracle, _oracle.SET_MIN_BALANCE_ROLE(), _manager);
    }

    // PERMISSIONS FNS
    function _setupBasePermissions(
        ACL _acl,
        bool _useAgentAsVault,
        DandelionVoting dandelionVoting,
        Redemptions redemptions,
        TokenRequest tokenRequest
    )
        internal
    {
        (Finance finance, TokenManager tokenManager, Vault agentOrVault) = _getBaseApps();

        // Finance permissions
        _createFinancePermissions(_acl, finance, dandelionVoting, dandelionVoting);
        _createFinanceCreatePaymentsPermission(_acl, finance, dandelionVoting, dandelionVoting);

        // TM permissions
        _acl.createPermission(tokenRequest, tokenManager, tokenManager.MINT_ROLE(), dandelionVoting);
        _acl.createPermission(redemptions, tokenManager, tokenManager.BURN_ROLE(), dandelionVoting);

        // Agent or Vault permissions
        if (_useAgentAsVault) {
            _createAgentPermissions(_acl, Agent(agentOrVault), dandelionVoting, dandelionVoting);
        }

        _createVaultPermissions(_acl, agentOrVault, finance, address(this));
        _acl.grantPermission(redemptions, agentOrVault, agentOrVault.TRANSFER_ROLE());

        //change manager
        _acl.setPermissionManager(dandelionVoting, agentOrVault, agentOrVault.TRANSFER_ROLE());



    }

    function _setupDandelionPermissions(
        ACL _acl,
        DandelionVoting dandelionVoting,
        Redemptions redemptions,
        TokenRequest tokenRequest,
        TimeLock timeLock,
        TokenBalanceOracle tokenBalanceOracle
    )
        internal
    {
        _createDandelionVotingPermissions(_acl, dandelionVoting, dandelionVoting, timeLock, dandelionVoting);
        _createRedemptionsPermissions(_acl, redemptions, dandelionVoting, dandelionVoting, dandelionVoting);
        _createTokenRequestPermissions(_acl, tokenRequest, dandelionVoting, dandelionVoting);
        _createTokenBalanceOraclePermissions(_acl, tokenBalanceOracle, dandelionVoting, dandelionVoting);
        _createTimeLockPermissions(_acl, timeLock, dandelionVoting, dandelionVoting, tokenBalanceOracle);
    }

    // SAVE FNS
    function _saveToken(MiniMeToken _token) internal {
        DeployedContracts storage senderDeployedContracts = deployedContracts[msg.sender];

        senderDeployedContracts.token = address(_token);
    }

    function _saveBaseApps(Kernel _dao,  Finance _finance, TokenManager _tokenManager, Vault _vault) internal {
        DeployedContracts storage senderDeployedContracts = deployedContracts[msg.sender];

        senderDeployedContracts.dao = address(_dao);
        senderDeployedContracts.finance = address(_finance);
        senderDeployedContracts.tokenManager = address(_tokenManager);
        senderDeployedContracts.agentOrVault = address(_vault);
    }

    function _saveAgentAsVault(Kernel _dao, bool _agentAsVault) internal {
        DeployedContracts storage senderDeployedContracts = deployedContracts[msg.sender];

        senderDeployedContracts.agentAsVault = _agentAsVault;
    }

    function _getDao() internal returns (Kernel dao) {
        DeployedContracts storage senderDeployedContracts = deployedContracts[msg.sender];
        require(senderDeployedContracts.dao != address(0), ERROR_MISSING_DAO_CONTRACT);

        dao = Kernel(senderDeployedContracts.dao);
    }

    function _getToken() internal returns (MiniMeToken) {
        DeployedContracts storage senderDeployedContracts = deployedContracts[msg.sender];
        require(senderDeployedContracts.token != address(0), ERROR_MISSING_TOKEN_CONTRACT);

        MiniMeToken token = MiniMeToken(senderDeployedContracts.token);
        return token;
    }

    function _getBaseApps() internal returns (
        Finance finance,
        TokenManager tokenManager,
        Vault vault
    )
    {
        DeployedContracts storage senderDeployedContracts = deployedContracts[msg.sender];
        require(senderDeployedContracts.dao != address(0), ERROR_MISSING_DAO_CONTRACT);

        finance = Finance(senderDeployedContracts.finance);
        tokenManager = TokenManager(senderDeployedContracts.tokenManager);
        vault = Vault(senderDeployedContracts.agentOrVault);
    }

    function _getAgentAsVault() internal returns (bool agentAsVault) {
        DeployedContracts storage senderDeployedContracts = deployedContracts[msg.sender];
        require(senderDeployedContracts.dao != address(0), ERROR_MISSING_DAO_CONTRACT);

        agentAsVault = senderDeployedContracts.agentAsVault;
    }

    function _clearDeployedContracts() internal {
        DeployedContracts storage senderDeployedContracts = deployedContracts[msg.sender];
        require(senderDeployedContracts.dao != address(0), ERROR_MISSING_DAO_CONTRACT);

        delete senderDeployedContracts.dao;
        delete senderDeployedContracts.token;
        delete senderDeployedContracts.finance;
        delete senderDeployedContracts.tokenManager;
        delete senderDeployedContracts.agentOrVault;
        delete senderDeployedContracts.agentAsVault;
    }

    function _ensureBaseAppsDeployed() internal {
        DeployedContracts storage senderDeployedContracts = deployedContracts[msg.sender];
        require(senderDeployedContracts.finance != address(0), ERROR_MISSING_FINANCE_CONTRACT);
        require(senderDeployedContracts.tokenManager != address(0), ERROR_MISSING_TOKEN_MANAGER_CONTRACT);
        require(senderDeployedContracts.agentOrVault != address(0), ERROR_MISSING_VAULT_CONTRACT);
    }

    function _ensureBaseSettings(address[] memory _holders, uint256[] memory _stakes) private pure {
        require(_holders.length > 0, ERROR_EMPTY_HOLDERS);
        require(_holders.length == _stakes.length, ERROR_BAD_HOLDERS_STAKES_LEN);
    }

    function _ensureDandelionSettings(
        address[] memory _tokenRequestAcceptedDepositTokens,
        address _timeLockToken
    )
        private
    {
        require(_tokenRequestAcceptedDepositTokens.length > 0, ERROR_BAD_TOKENREQUEST_TOKEN_LIST);
        require(isContract(_timeLockToken), ERROR_TIMELOCK_TOKEN_NOT_CONTRACT);
    }

    function _registerApp(Kernel _dao, bytes32 _appId) private returns (address) {
        address proxy = _dao.newAppInstance(_appId, _latestVersionAppBase(_appId));
        emit InstalledApp(proxy, _appId);

        return proxy;
    }

    // ORACLE FNS
    function _setOracle(ACL _acl, address _who, address _where, bytes32 _what, address _oracle) private {
        uint256[] memory params = new uint256[](1);
        params[0] = _paramsTo256(ORACLE_PARAM_ID, uint8(Op.EQ), uint240(_oracle));

        _acl.grantPermissionP(_who, _where, _what, params);
    }

    function _paramsTo256(uint8 _id,uint8 _op, uint240 _value) private returns (uint256) {
        return (uint256(_id) << 248) + (uint256(_op) << 240) + _value;
    }

}