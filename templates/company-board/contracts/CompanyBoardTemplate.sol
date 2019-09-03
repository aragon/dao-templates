pragma solidity 0.4.24;

import "@aragon/templates-shared/contracts/BaseTemplate.sol";


contract CompanyBoardTemplate is BaseTemplate {
    string constant private ERROR_MISSING_CACHE = "COMPANYBD_MISSING_CACHE";
    string constant private ERROR_MISSING_BOARD_MEMBERS = "COMPANYBD_MISSING_BOARD_MEMBERS";
    string constant private ERROR_MISSING_SHARE_MEMBERS = "COMPANYBD_MISSING_SHARE_MEMBERS";
    string constant private ERROR_BAD_HOLDERS_STAKES_LEN = "COMPANYBD_BAD_HOLDERS_STAKES_LEN";
    string constant private ERROR_BAD_VOTE_SETTINGS = "COMPANYBD_BAD_VOTE_SETTINGS";
    string constant private ERROR_BAD_PAYROLL_SETTINGS = "COMPANYBD_BAD_PAYROLL_SETTINGS";

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
        address shareToken;
        address boardToken;
        address shareVoting;
        address boardVoting;
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
    * @dev Create an incomplete Company with Board DAO and cache it for later setup steps
    * @param _shareTokenName String with the name for the token used by share holders in the organization
    * @param _shareTokenSymbol String with the symbol for the token used by share holders in the organization
    * @param _shareVotingSettings Array of [supportRequired, minAcceptanceQuorum, voteDuration] to set up the share voting app of the organization
    * @param _boardVotingSettings Array of [supportRequired, minAcceptanceQuorum, voteDuration] to set up the board voting app of the organization
    */
    function prepareInstance(
        string _shareTokenName,
        string _shareTokenSymbol,
        uint64[3] _shareVotingSettings,
        uint64[3] _boardVotingSettings
    )
        external
    {
        require(_boardVotingSettings.length == 3, ERROR_BAD_VOTE_SETTINGS);
        require(_shareVotingSettings.length == 3, ERROR_BAD_VOTE_SETTINGS);

        MiniMeToken shareToken = _createToken(_shareTokenName, _shareTokenSymbol, SHARE_TOKEN_DECIMALS);
        MiniMeToken boardToken = _createToken(BOARD_TOKEN_NAME, BOARD_TOKEN_SYMBOL, BOARD_TOKEN_DECIMALS);

        (Kernel dao, ACL acl) = _createDAO();
        Voting shareVoting = _installVotingApp(dao, shareToken, _shareVotingSettings);
        Voting boardVoting = _installVotingApp(dao, boardToken, _boardVotingSettings);

        _createEvmScriptsRegistryPermissions(acl, shareVoting, shareVoting);

        _cachePreparedDao(dao, shareToken, boardToken, shareVoting, boardVoting);
    }

    /**
    * @dev Finalize a previously prepared DAO instance cached by the user
    * @param _id String with the name for org, will assign `[id].aragonid.eth`
    * @param _shareHolders Array of share holder addresses
    * @param _shareStakes Array of token stakes for share holders (token has 18 decimals, multiply token amount `* 10^18`)
    * @param _boardMembers Array of board member addresses (1 token will be minted for each board member)
    * @param _financePeriod Initial duration for accounting periods, it can be set to zero in order to use the default of 30 days.
    * @param _useAgentAsVault Boolean to tell whether to use an Agent app as a more advanced form of Vault app
    */
    function finalizeInstance(
        string _id,
        address[] _shareHolders,
        uint256[] _shareStakes,
        address[] _boardMembers,
        uint64 _financePeriod,
        bool _useAgentAsVault
    )
        external
    {
        _validateId(_id);
        _ensureFinalizationSettings(_shareHolders, _shareStakes, _boardMembers);

        (Kernel dao, Voting shareVoting, Voting boardVoting) = _popDaoCache();

        Finance finance = _setupVaultAndFinanceApps(dao, _financePeriod, _useAgentAsVault, shareVoting, boardVoting);
        _finalizeApps(dao, _shareHolders, _shareStakes, _boardMembers, shareVoting, boardVoting);

        _transferCreatePaymentManagerFromTemplate(ACL(dao.acl()), finance, shareVoting);
        _transferRootPermissionsFromTemplateAndFinalizeDAO(dao, shareVoting);
        _registerID(_id, address(dao));
    }

    /**
    * @dev Finalize a previously prepared DAO instance cached by the user
    * @param _id String with the name for org, will assign `[id].aragonid.eth`
    * @param _shareHolders Array of share holder addresses
    * @param _shareStakes Array of token stakes for share holders (token has 18 decimals, multiply token amount `* 10^18`)
    * @param _boardMembers Array of board member addresses (1 token will be minted for each board member)
    * @param _financePeriod Initial duration for accounting periods, it can be set to zero in order to use the default of 30 days.
    * @param _useAgentAsVault Boolean to tell whether to use an Agent app as a more advanced form of Vault app
    * @param _payrollSettings Array of [address denominationToken , IFeed priceFeed, uint64 rateExpiryTime, address employeeManager]
             for the payroll app. The `employeeManager` can be set to `0x0` in order to use the board voting app as the employee manager.
    */
    function finalizeInstance(
        string _id,
        address[] _shareHolders,
        uint256[] _shareStakes,
        address[] _boardMembers,
        uint64 _financePeriod,
        bool _useAgentAsVault,
        uint256[4] _payrollSettings
    )
        external
    {
        _validateId(_id);
        _ensureFinalizationSettings(_shareHolders, _shareStakes, _boardMembers);
        require(_payrollSettings.length == 4, ERROR_BAD_PAYROLL_SETTINGS);

        (Kernel dao, Voting shareVoting, Voting boardVoting) = _popDaoCache();

        Finance finance = _setupVaultAndFinanceApps(dao, _financePeriod, _useAgentAsVault, shareVoting, boardVoting);
        _setupPayrollApp(dao, finance, _payrollSettings, boardVoting);
        _finalizeApps(dao, _shareHolders, _shareStakes, _boardMembers, shareVoting, boardVoting);

        _transferCreatePaymentManagerFromTemplate(ACL(dao.acl()), finance, shareVoting);
        _transferRootPermissionsFromTemplateAndFinalizeDAO(dao, shareVoting);
        _registerID(_id, address(dao));
    }

    function _finalizeApps(
        Kernel _dao,
        address[] memory _shareHolders,
        uint256[] memory _shareStakes,
        address[] memory _boardMembers,
        Voting _shareVoting,
        Voting _boardVoting
    )
        internal
    {
        (MiniMeToken shareToken, MiniMeToken boardToken) = _popTokenCaches();

        // Install
        TokenManager shareTokenManager = _installTokenManagerApp(_dao, shareToken, SHARE_TRANSFERABLE, SHARE_MAX_PER_ACCOUNT);
        TokenManager boardTokenManager = _installTokenManagerApp(_dao, boardToken, BOARD_TRANSFERABLE, BOARD_MAX_PER_ACCOUNT);

        // Mint tokens
        ACL acl = ACL(_dao.acl());
        _mintTokens(acl, shareTokenManager, _shareHolders, _shareStakes);
        _mintTokens(acl, boardTokenManager, _boardMembers, 1);

        // Assign permissions for token managers
        _createTokenManagerPermissions(acl, shareTokenManager, _shareVoting, _shareVoting);
        _createTokenManagerPermissions(acl, boardTokenManager, _shareVoting, _shareVoting);

        // Assign permissions for votings
        _createVotingPermissions(acl, _shareVoting, _shareVoting, boardTokenManager, _shareVoting);
        _createVotingPermissions(acl, _boardVoting, _shareVoting, boardTokenManager, _shareVoting);
    }

    function _setupVaultAndFinanceApps(
        Kernel _dao,
        uint64 _financePeriod,
        bool _useAgentAsVault,
        Voting _shareVoting,
        Voting _boardVoting
    )
        internal
        returns (Finance)
    {
        // Install
        Vault agentOrVault = _useAgentAsVault ? _installDefaultAgentApp(_dao) : _installVaultApp(_dao);
        Finance finance = _installFinanceApp(_dao, agentOrVault, _financePeriod == 0 ? DEFAULT_FINANCE_PERIOD : _financePeriod);

        // Assign permissions
        ACL acl = ACL(_dao.acl());
        if (_useAgentAsVault) {
            _createCustomAgentPermissions(acl, Agent(agentOrVault), _shareVoting, _boardVoting);
        }
        _createVaultPermissions(acl, agentOrVault, finance, _shareVoting);
        _createFinancePermissions(acl, finance, _boardVoting, _shareVoting);
        _createFinanceCreatePaymentsPermission(acl, finance, _boardVoting, address(this));

        return finance;
    }

    function _setupPayrollApp(Kernel _dao, Finance _finance, uint256[4] memory _payrollSettings, Voting _boardVoting) internal {
        (address denominationToken, IFeed priceFeed, uint64 rateExpiryTime, address employeeManager) = _unwrapPayrollSettings(_payrollSettings);
        address manager = employeeManager == address(0) ? _boardVoting : employeeManager;

        Payroll payroll = _installPayrollApp(_dao, _finance, denominationToken, priceFeed, rateExpiryTime);
        ACL acl = ACL(_dao.acl());
        _createPayrollPermissions(acl, payroll, manager, _boardVoting, _boardVoting);
        _grantCreatePaymentPermission(acl, _finance, payroll);
    }

    function _createCustomAgentPermissions(ACL _acl, Agent _agent, Voting _shareVoting, Voting _boardVoting) internal {
        _acl.createPermission(_boardVoting, _agent, _agent.EXECUTE_ROLE(), _shareVoting);
        _acl.createPermission(_boardVoting, _agent, _agent.RUN_SCRIPT_ROLE(), _shareVoting);
    }

    function _cachePreparedDao(
        Kernel _dao,
        MiniMeToken _shareToken,
        MiniMeToken _boardToken,
        Voting _shareVoting,
        Voting _boardVoting
    )
        internal
    {
        Cache storage c = cache[msg.sender];
        c.dao = address(_dao);
        c.shareToken = address(_shareToken);
        c.boardToken = address(_boardToken);
        c.shareVoting = address(_shareVoting);
        c.boardVoting = address(_boardVoting);
    }

    function _popDaoCache() internal returns (Kernel dao, Voting shareVoting, Voting boardVoting) {
        Cache storage c = cache[msg.sender];
        require(c.dao != address(0) && c.shareVoting != address(0) && c.boardVoting != address(0), ERROR_MISSING_CACHE);

        dao = Kernel(c.dao);
        shareVoting = Voting(c.shareVoting);
        boardVoting = Voting(c.boardVoting);
        delete c.dao;
        delete c.shareVoting;
        delete c.boardVoting;
    }

    function _popTokenCaches() internal returns (MiniMeToken shareToken, MiniMeToken boardToken) {
        Cache storage c = cache[msg.sender];
        require(c.shareToken != address(0) && c.boardToken != address(0), ERROR_MISSING_CACHE);

        shareToken = MiniMeToken(c.shareToken);
        boardToken = MiniMeToken(c.boardToken);
        delete c.shareToken;
        delete c.boardToken;
    }

    function _ensureFinalizationSettings(
        address[] memory _shareHolders,
        uint256[] memory _shareStakes,
        address[] memory _boardMembers
    )
        private
        pure
    {
        require(_shareHolders.length > 0, ERROR_MISSING_SHARE_MEMBERS);
        require(_shareHolders.length == _shareStakes.length, ERROR_BAD_HOLDERS_STAKES_LEN);
        require(_boardMembers.length > 0, ERROR_MISSING_BOARD_MEMBERS);
    }
}
