pragma solidity 0.4.24;

import "@aragon/templates-shared/contracts/BaseTemplate.sol";


contract CompanyBoardTemplate is BaseTemplate {
    string constant private ERROR_MISSING_CACHE = "COMPANY_MISSING_CACHE";
    string constant private ERROR_MISSING_BOARD_MEMBERS = "COMPANY_MISSING_BOARD_MEMBERS";
    string constant private ERROR_MISSING_SHARE_MEMBERS = "COMPANY_MISSING_SHARE_MEMBERS";
    string constant private ERROR_BAD_HOLDERS_STAKES_LEN = "COMPANY_BAD_HOLDERS_STAKES_LEN";
    string constant private ERROR_BAD_VOTE_SETTINGS = "COMPANY_BAD_VOTE_SETTINGS";

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
    }

    mapping (address => Cache) internal cache;

    constructor(DAOFactory _daoFactory, ENS _ens, MiniMeTokenFactory _miniMeFactory, IFIFSResolvingRegistrar _aragonID)
        BaseTemplate(_daoFactory, _ens, _miniMeFactory, _aragonID)
        public
    {
        _ensureAragonIdIsValid(_aragonID);
        _ensureMiniMeFactoryIsValid(_miniMeFactory);
    }

    function prepareInstance(string _shareTokenName, string _shareTokenSymbol) external {
        (Kernel dao,) = _createDAO();
        MiniMeToken boardToken = _createToken(BOARD_TOKEN_NAME, BOARD_TOKEN_SYMBOL, BOARD_TOKEN_DECIMALS);
        MiniMeToken shareToken = _createToken(_shareTokenName, _shareTokenSymbol, SHARE_TOKEN_DECIMALS);
        _storeCache(dao, boardToken, shareToken, msg.sender);
    }

    function setupInstance(
        string _id,
        address[] _boardMembers,
        address[] _shareHolders,
        uint256[] _shareStakes,
        uint64[3] _boardVotingSettings, /* [supportRequired, minAcceptanceQuorum, voteDuration] */
        uint64[3] _shareVotingSettings, /* [supportRequired, minAcceptanceQuorum, voteDuration] */
        uint64 _financePeriod,
        bool _useAgentAsVault
    )
        external
    {
        Kernel dao = _popDaoCache(msg.sender);
        _setupApps(dao, _boardMembers, _shareHolders, _shareStakes, _boardVotingSettings, _shareVotingSettings, _financePeriod, _useAgentAsVault);
        _registerID(_id, address(dao));
    }

    function _setupApps(
        Kernel _dao,
        address[] _boardMembers,
        address[] _shareHolders,
        uint256[] _shareStakes,
        uint64[3] _boardVotingSettings, /* [supportRequired, minAcceptanceQuorum, voteDuration] */
        uint64[3] _shareVotingSettings, /* [supportRequired, minAcceptanceQuorum, voteDuration] */
        uint64 _financePeriod,
        bool _useAgentAsVault
    )
        internal
    {
        Vault agentOrVault = _useAgentAsVault ? _installDefaultAgentApp(_dao) : _installVaultApp(_dao);
        Finance finance = _installFinanceApp(_dao, agentOrVault, _financePeriod == 0 ? DEFAULT_FINANCE_PERIOD : _financePeriod);
        (TokenManager boardTokenManager, Voting boardVoting, TokenManager shareTokenManager, Voting shareVoting) = _installTokenApps(
            _dao,
            _boardMembers,
            _boardVotingSettings,
            _shareHolders,
            _shareStakes,
            _shareVotingSettings
        );

        _setupPermissions(_dao, boardVoting, boardTokenManager, shareVoting, shareTokenManager, agentOrVault, finance, _useAgentAsVault);
    }

    function _installTokenApps(
        Kernel _dao,
        address[] _boardMembers,
        uint64[3] _boardVotingSettings,
        address[] _shareHolders,
        uint256[] _shareStakes,
        uint64[3] _shareVotingSettings
    )
        internal
        returns (TokenManager boardTokenManager, Voting boardVoting, TokenManager shareTokenManager, Voting shareVoting)
    {
        require(_boardMembers.length > 0, ERROR_MISSING_BOARD_MEMBERS);
        require(_boardVotingSettings.length == 3, ERROR_BAD_VOTE_SETTINGS);
        require(_shareHolders.length > 0, ERROR_MISSING_SHARE_MEMBERS);
        require(_shareHolders.length == _shareStakes.length, ERROR_BAD_HOLDERS_STAKES_LEN);
        require(_shareVotingSettings.length == 3, ERROR_BAD_VOTE_SETTINGS);

        ACL acl = ACL(_dao.acl());
        (MiniMeToken boardToken, MiniMeToken shareToken) = _popTokensCache(msg.sender);

        boardVoting = _installVotingApp(_dao, boardToken, _boardVotingSettings[0], _boardVotingSettings[1], _boardVotingSettings[2]);
        shareVoting = _installVotingApp(_dao, shareToken, _shareVotingSettings[0], _shareVotingSettings[1], _shareVotingSettings[2]);
        boardTokenManager = _installTokenManagerApp(_dao, boardToken, BOARD_TRANSFERABLE, BOARD_MAX_PER_ACCOUNT);
        shareTokenManager = _installTokenManagerApp(_dao, shareToken, SHARE_TRANSFERABLE, SHARE_MAX_PER_ACCOUNT);

        _mintTokens(acl, boardTokenManager, _boardMembers, 1);
        _mintTokens(acl, shareTokenManager, _shareHolders, _shareStakes);
    }

    function _setupPermissions(
        Kernel _dao,
        Voting _boardVoting,
        TokenManager _boardTokenManager,
        Voting _shareVoting,
        TokenManager _shareTokenManager,
        Vault _agentOrVault,
        Finance _finance,
        bool _useAgentAsVault
    )
        internal
    {
        ACL acl = ACL(_dao.acl());

        if (_useAgentAsVault) {
            _createCustomAgentPermissions(acl, Agent(_agentOrVault), _boardVoting, _shareVoting);
        }
        _createVaultPermissions(acl, _agentOrVault, _finance, _shareVoting);
        _createCustomFinancePermissions(acl, _finance, _boardVoting, _shareVoting);
        _createCustomTokenManagerPermissions(acl, _boardTokenManager, _shareVoting);
        _createCustomTokenManagerPermissions(acl, _shareTokenManager, _shareVoting);
        _createCustomVotingPermissions(acl, _boardVoting, _shareVoting, _boardTokenManager);
        _createEvmScriptsRegistryPermissions(acl, _shareVoting, _shareVoting);
        _transferRootPermissionsFromTemplate(_dao, _boardVoting, _shareVoting);
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

    function _storeCache(Kernel _dao, MiniMeToken _boardToken, MiniMeToken _shareToken, address _owner) internal {
        Cache storage c = cache[_owner];
        c.dao = address(_dao);
        c.boardToken = address(_boardToken);
        c.shareToken = address(_shareToken);
    }

    function _popDaoCache(address _owner) internal returns (Kernel) {
        Cache storage c = cache[_owner];
        require(c.dao != address(0), ERROR_MISSING_CACHE);

        Kernel dao = Kernel(c.dao);
        delete c.dao;
        return dao;
    }

    function _popTokensCache(address _owner) internal returns (MiniMeToken boardToken, MiniMeToken shareToken) {
        Cache storage c = cache[_owner];
        require(c.boardToken != address(0) && c.shareToken != address(0), ERROR_MISSING_CACHE);

        boardToken = MiniMeToken(c.boardToken);
        shareToken = MiniMeToken(c.shareToken);
        delete c.boardToken;
        delete c.shareToken;
    }
}
