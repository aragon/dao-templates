pragma solidity 0.4.24;

import "@aragon/templates-shared/contracts/BaseTemplate.sol";


contract CompanyBoardTemplate is BaseTemplate {
    string constant private ERROR_MISSING_CACHE = "COMPANY_MISSING_CACHE";
    string constant private ERROR_MISSING_BOARD_MEMBERS = "COMPANY_MISSING_BOARD_MEMBERS";
    string constant private ERROR_MISSING_SHARE_MEMBERS = "COMPANY_MISSING_SHARE_MEMBERS";
    string constant private ERROR_BAD_HOLDERS_STAKES_LEN = "COMPANY_BAD_HOLDERS_STAKES_LEN";
    string constant private ERROR_BAD_VOTE_SETTINGS = "COMPANY_BAD_VOTE_SETTINGS";
    string constant private ERROR_BAD_PAYROLL_SETTINGS = "COMPANY_BAD_PAYROLL_SETTINGS";

    bool constant private BOARD_TRANSFERABLE = false;
    string constant private BOARD_TOKEN_NAME = "Board Token";
    string constant private BOARD_TOKEN_SYMBOL = "BOARD";
    uint8 constant private BOARD_TOKEN_DECIMALS = uint8(0);
    uint256 constant private BOARD_MAX_PER_ACCOUNT = uint256(1);

    bool constant private SHARE_TRANSFERABLE = true;
    uint8 constant private SHARE_TOKEN_DECIMALS = uint8(18);
    uint256 constant private SHARE_MAX_PER_ACCOUNT = uint256(0);

    uint64 constant private DEFAULT_FINANCE_PERIOD = uint64(30 days);

    struct Cache {
        address dao;
        address boardToken;
        address shareToken;
        address boardVoting;
        address boardTokenManager;
    }

    mapping (address => Cache) internal cache;

    constructor(DAOFactory _daoFactory, ENS _ens, MiniMeTokenFactory _miniMeFactory, IFIFSResolvingRegistrar _aragonID)
        BaseTemplate(_daoFactory, _ens, _miniMeFactory, _aragonID)
        public
    {
        _ensureAragonIdIsValid(_aragonID);
        _ensureMiniMeFactoryIsValid(_miniMeFactory);
    }

    /**
    * @dev Create a new pair of MiniMe tokens for the Company with Board DAO and cache it for later setup steps
    * @param _shareTokenName String with the name for the token used by share holders in the organization
    * @param _shareTokenSymbol String with the symbol for the token used by share holders in the organization
    */
    function prepareInstance(string _shareTokenName, string _shareTokenSymbol) external {
        (Kernel dao,) = _createDAO();
        MiniMeToken boardToken = _createToken(BOARD_TOKEN_NAME, BOARD_TOKEN_SYMBOL, BOARD_TOKEN_DECIMALS);
        MiniMeToken shareToken = _createToken(_shareTokenName, _shareTokenSymbol, SHARE_TOKEN_DECIMALS);
        _cacheDao(dao, boardToken, shareToken);
    }

    /**
    * @dev Setup a user's prepared DAO instance with the Board components
    * @param _members Array of board member addresses (1 token will be minted for each board member)
    * @param _votingSettings Array of [supportRequired, minAcceptanceQuorum, voteDuration] to set up the board voting app of the organization
    */
    function setupBoard(address[] _members, uint64[3] _votingSettings) external {
        require(_members.length > 0, ERROR_MISSING_BOARD_MEMBERS);
        require(_votingSettings.length == 3, ERROR_BAD_VOTE_SETTINGS);

        Kernel dao = _fetchDaoCache();
        _setupBoardApps(dao, _members, _votingSettings);
    }

    /**
    * @dev Finalize a user's prepared DAO instance (with the Board installed)
    * @param _id String with the name for org, will assign `[id].aragonid.eth`
    * @param _holders Array of share holder addresses
    * @param _stakes Array of token stakes for share holders (token has 18 decimals, multiply token amount `* 10^18`)
    * @param _votingSettings Array of [supportRequired, minAcceptanceQuorum, voteDuration] to set up the share voting app of the organization
    * @param _financePeriod Initial duration for accounting periods, it can be set to zero in order to use the default of 30 days.
    * @param _useAgentAsVault Boolean to tell whether to use an Agent app as a more advanced form of Vault app
    */
    function setupShare(string _id, address[] _holders, uint256[] _stakes, uint64[3] _votingSettings, uint64 _financePeriod, bool _useAgentAsVault) external {
        _ensureCompanySettings(_holders, _stakes, _votingSettings);

        (, Voting boardVoting, Voting shareVoting) = _setupShareApps(_holders, _stakes, _votingSettings, _financePeriod, _useAgentAsVault);

        Kernel dao = _popDaoCache();
        _transferRootPermissionsFromTemplate(dao, boardVoting, shareVoting);
        _registerID(_id, address(dao));
    }

    /**
    * @dev Finalize a user's prepared DAO instance (with the Board installed)
    * @param _id String with the name for org, will assign `[id].aragonid.eth`
    * @param _holders Array of share holder addresses
    * @param _stakes Array of token stakes for share holders (token has 18 decimals, multiply token amount `* 10^18`)
    * @param _votingSettings Array of [supportRequired, minAcceptanceQuorum, voteDuration] to set up the share voting app of the organization
    * @param _financePeriod Initial duration for accounting periods, it can be set to zero in order to use the default of 30 days.
    * @param _useAgentAsVault Boolean to tell whether to use an Agent app as a more advanced form of Vault app
    * @param _payrollSettings Array of [address denominationToken , IFeed priceFeed, uint64 rateExpiryTime, address employeeManager]
             for the payroll app. The `employeeManager` can be set to `0x0` in order to use the voting app as the employee manager.
    */
    function setupShare(string _id, address[] _holders, uint256[] _stakes, uint64[3] _votingSettings, uint64 _financePeriod, bool _useAgentAsVault, uint256[4] _payrollSettings) external {
        _ensureCompanySettings(_holders, _stakes, _votingSettings,_payrollSettings);

        (Finance finance, Voting boardVoting, Voting shareVoting) = _setupShareApps(_holders, _stakes, _votingSettings, _financePeriod, _useAgentAsVault);

        Kernel dao = _popDaoCache();
        _setupPayrollApp(dao, finance, boardVoting, _payrollSettings);
        _transferRootPermissionsFromTemplate(dao, boardVoting, shareVoting);
        _registerID(_id, address(dao));
    }

    function _setupBoardApps(Kernel _dao, address[] _members, uint64[3] _votingSettings) internal {
        ACL acl = ACL(_dao.acl());
        MiniMeToken token = _popBoardTokenCache();
        Voting voting = _installVotingApp(_dao, token, _votingSettings[0], _votingSettings[1], _votingSettings[2]);
        TokenManager tokenManager = _installTokenManagerApp(_dao, token, BOARD_TRANSFERABLE, BOARD_MAX_PER_ACCOUNT);

        _mintTokens(acl, tokenManager, _members, 1);
        _cacheBoardApps(voting, tokenManager);
    }

    function _setupShareApps(address[] _holders, uint256[] _stakes, uint64[3] _votingSettings, uint64 _financePeriod, bool _useAgentAsVault) internal returns (Finance, Voting, Voting) {
        (Voting shareVoting, TokenManager shareTokenManager) = _installTokenApps(_holders, _stakes, _votingSettings);
        (Vault agentOrVault, Finance finance) = _installVaultAndFinance(_financePeriod, _useAgentAsVault);
        Voting boardVoting = _setupPermissions(shareVoting, shareTokenManager, agentOrVault, finance, _useAgentAsVault);
        return (finance, boardVoting, shareVoting);
    }

    function _setupPayrollApp(Kernel _dao, Finance _finance, Voting _voting, uint256[4] _payrollSettings) internal {
        (address denominationToken, IFeed priceFeed, uint64 rateExpiryTime, address employeeManager) = _unwrapPayrollSettings(_payrollSettings);
        address manager = employeeManager == address(0) ? _voting : employeeManager;

        ACL acl = ACL(_dao.acl());
        Payroll payroll = _installPayrollApp(_dao, _finance, denominationToken, priceFeed, rateExpiryTime);
        _createPayrollPermissions(acl, payroll, manager, _voting, _voting);
    }

    function _installTokenApps(address[] _holders, uint256[] _stakes, uint64[3] _votingSettings) internal returns (Voting shareVoting, TokenManager shareTokenManager) {
        Kernel dao = _fetchDaoCache();
        ACL acl = ACL(dao.acl());

        MiniMeToken token = _popShareTokenCache();
        shareVoting = _installVotingApp(dao, token, _votingSettings[0], _votingSettings[1], _votingSettings[2]);
        shareTokenManager = _installTokenManagerApp(dao, token, SHARE_TRANSFERABLE, SHARE_MAX_PER_ACCOUNT);
        _mintTokens(acl, shareTokenManager, _holders, _stakes);
    }

    function _installVaultAndFinance(uint64 _financePeriod, bool _useAgentAsVault) internal returns (Vault agentOrVault, Finance finance) {
        Kernel dao = _fetchDaoCache();
        agentOrVault = _useAgentAsVault ? _installDefaultAgentApp(dao) : _installVaultApp(dao);
        finance = _installFinanceApp(dao, agentOrVault, _financePeriod == 0 ? DEFAULT_FINANCE_PERIOD : _financePeriod);
    }

    function _setupPermissions(Voting _shareVoting, TokenManager _shareTokenManager, Vault _agentOrVault, Finance _finance, bool _useAgentAsVault) internal returns (Voting) {
        Kernel dao = _fetchDaoCache();
        ACL _acl = ACL(dao.acl());
        (Voting boardVoting, TokenManager boardTokenManager) = _popBoardApps();

        if (_useAgentAsVault) {
            _createCustomAgentPermissions(_acl, Agent(_agentOrVault), boardVoting, _shareVoting);
        }
        _createVaultPermissions(_acl, _agentOrVault, _finance, _shareVoting);
        _createCustomFinancePermissions(_acl, _finance, boardVoting, _shareVoting);
        _createCustomTokenManagerPermissions(_acl, boardTokenManager, _shareVoting);
        _createCustomTokenManagerPermissions(_acl, _shareTokenManager, _shareVoting);
        _createCustomVotingPermissions(_acl, boardVoting, _shareVoting, boardTokenManager);
        _createEvmScriptsRegistryPermissions(_acl, _shareVoting, _shareVoting);
        return boardVoting;
    }

    function _createCustomAgentPermissions(ACL _acl, Agent _agent, Voting _boardVoting, Voting _shareVoting) internal {
        address[] memory grantees = new address[](2);
        grantees[0] = address(_boardVoting);
        grantees[1] = address(_shareVoting);

        _createPermissions(_acl, grantees, _agent, _agent.EXECUTE_ROLE(), _shareVoting);
        _createPermissions(_acl, grantees, _agent, _agent.RUN_SCRIPT_ROLE(), _shareVoting);
    }

    function _createCustomFinancePermissions(ACL _acl, Finance _finance, Voting _boardVoting, Voting _shareVoting) internal {
        address[] memory grantees = new address[](2);
        grantees[0] = address(_boardVoting);
        grantees[1] = address(_shareVoting);

        _createPermissions(_acl, grantees, _finance, _finance.CREATE_PAYMENTS_ROLE(), _shareVoting);
        _acl.createPermission(_shareVoting, _finance, _finance.EXECUTE_PAYMENTS_ROLE(), _shareVoting);
        _acl.createPermission(_shareVoting, _finance, _finance.MANAGE_PAYMENTS_ROLE(), _shareVoting);
    }

    function _createCustomVotingPermissions(ACL _acl, Voting _boardVoting, Voting _shareVoting, TokenManager _boardTokenManager) internal {
        _acl.createPermission(_boardTokenManager, _boardVoting, _boardVoting.CREATE_VOTES_ROLE(), _shareVoting);
        _acl.createPermission(_shareVoting, _boardVoting, _boardVoting.MODIFY_QUORUM_ROLE(), _shareVoting);
        _acl.createPermission(_shareVoting, _boardVoting, _boardVoting.MODIFY_SUPPORT_ROLE(), _shareVoting);

        _acl.createPermission(_boardTokenManager, _shareVoting, _shareVoting.CREATE_VOTES_ROLE(), _shareVoting);
        _acl.createPermission(_shareVoting, _shareVoting, _shareVoting.MODIFY_QUORUM_ROLE(), _shareVoting);
        _acl.createPermission(_shareVoting, _shareVoting, _shareVoting.MODIFY_SUPPORT_ROLE(), _shareVoting);
    }

    function _createCustomTokenManagerPermissions(ACL _acl, TokenManager _tokenManager, Voting _voting) internal {
        _acl.createPermission(_voting, _tokenManager, _tokenManager.BURN_ROLE(), _voting);
        _acl.createPermission(_voting, _tokenManager, _tokenManager.MINT_ROLE(), _voting);
    }

    function _cacheDao(Kernel _dao, MiniMeToken _boardToken, MiniMeToken _shareToken) internal {
        Cache storage c = cache[msg.sender];
        c.dao = address(_dao);
        c.boardToken = address(_boardToken);
        c.shareToken = address(_shareToken);
    }

    function _cacheBoardApps(Voting _boardVoting, TokenManager _boardTokenManager) internal {
        Cache storage c = cache[msg.sender];
        c.boardVoting = address(_boardVoting);
        c.boardTokenManager = address(_boardTokenManager);
    }

    function _popDaoCache() internal returns (Kernel) {
        Cache storage c = cache[msg.sender];
        require(c.dao != address(0), ERROR_MISSING_CACHE);

        Kernel dao = Kernel(c.dao);
        delete c.dao;
        return dao;
    }

    function _popBoardTokenCache() internal returns (MiniMeToken) {
        Cache storage c = cache[msg.sender];
        require(c.boardToken != address(0), ERROR_MISSING_CACHE);

        MiniMeToken boardToken = MiniMeToken(c.boardToken);
        delete c.boardToken;
        return boardToken;
    }

    function _popShareTokenCache() internal returns (MiniMeToken) {
        Cache storage c = cache[msg.sender];
        require(c.shareToken != address(0), ERROR_MISSING_CACHE);

        MiniMeToken shareToken = MiniMeToken(c.shareToken);
        delete c.shareToken;
        return shareToken;
    }

    function _popBoardApps() internal returns (Voting boardVoting, TokenManager boardTokenManager) {
        Cache storage c = cache[msg.sender];
        require(c.boardVoting != address(0) && c.boardTokenManager != address(0), ERROR_MISSING_CACHE);

        boardVoting = Voting(c.boardVoting);
        boardTokenManager = TokenManager(c.boardTokenManager);
        delete c.boardVoting;
        delete c.boardTokenManager;
    }

    function _fetchDaoCache() internal view returns (Kernel) {
        Cache storage c = cache[msg.sender];
        require(c.dao != address(0), ERROR_MISSING_CACHE);
        return Kernel(c.dao);
    }

    function _ensureCompanySettings(address[] _holders, uint256[] _stakes, uint64[3] _votingSettings, uint256[4] _payrollSettings) private pure {
        _ensureCompanySettings(_holders, _stakes, _votingSettings);
        require(_payrollSettings.length == 4, ERROR_BAD_PAYROLL_SETTINGS);
    }

    function _ensureCompanySettings(address[] _holders, uint256[] _stakes, uint64[3] _votingSettings) private pure {
        require(_holders.length > 0, ERROR_MISSING_SHARE_MEMBERS);
        require(_holders.length == _stakes.length, ERROR_BAD_HOLDERS_STAKES_LEN);
        require(_votingSettings.length == 3, ERROR_BAD_VOTE_SETTINGS);
    }
}
