pragma solidity 0.4.24;

import "@aragon/templates-shared/contracts/BaseTemplate.sol";


contract CompanyBoardTemplate is BaseTemplate {
    string constant private ERROR_MISSING_DAO_CACHE = "COMPANY_MISSING_DAO_CACHE";
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

    function prepareInstance(string _shareTokenName, string _shareTokenSymbol) public {
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
        uint64[] _boardVoteSettings, /* [voteDuration, supportRequired, minAcceptanceQuorum] */
        uint64[] _shareVoteSettings, /* idem */
        uint64 _financePeriod,
        bool _useAgentAsVault
    ) 
        public 
    {
        require(_boardVoteSettings.length == 3, ERROR_BAD_VOTE_SETTINGS);
        require(_shareVoteSettings.length == 3, ERROR_BAD_VOTE_SETTINGS);
        (Vault agentOrVault, Finance finance) = _setupCommon(_financePeriod, _useAgentAsVault);
        (TokenManager boardTokenManager, Voting boardVoting) = _setupBoard(_boardMembers, _boardVoteSettings[0], _boardVoteSettings[1], _boardVoteSettings[2]);
        (TokenManager shareTokenManager, Voting shareVoting) = _setupShare(_shareHolders, _shareStakes, _shareVoteSettings[0], _shareVoteSettings[1], _shareVoteSettings[2]);
        _setupPermissions(boardVoting, boardTokenManager, shareVoting, shareTokenManager, agentOrVault, finance, _useAgentAsVault);
        _registerDAO(_id);
    }

    function _setupCommon(uint64 _financePeriod, bool _useAgentAsVault) internal returns (Vault _agentOrVault, Finance _finance) {
        (Kernel dao,,) = _getCache(msg.sender);

        // Install apps
        _agentOrVault = _useAgentAsVault ? _installDefaultAgentApp(dao) : _installVaultApp(dao);
        _finance = _installFinanceApp(dao, _agentOrVault, _financePeriod == 0 ? DEFAULT_FINANCE_PERIOD : _financePeriod); 
    }

    function _setupBoard(address[] _boardMembers, uint64 _boardVoteDuration, uint64 _boardSupportRequired, uint64 _boardMinAcceptanceQuorum) internal returns(TokenManager _boardTokenManager, Voting _boardVoting) {
        require(_boardMembers.length > 0, ERROR_MISSING_BOARD_MEMBERS);
        (Kernel dao, MiniMeToken boardToken,) = _getCache(msg.sender);

        // Install apps
        ACL acl = ACL(dao.acl());
        _boardTokenManager = _installTokenManagerApp(dao, boardToken, BOARD_TRANSFERABLE, BOARD_MAX_PER_ACCOUNT);
        _boardVoting = _installVotingApp(dao, boardToken, _boardSupportRequired, _boardMinAcceptanceQuorum, _boardVoteDuration);

        // Mint tokens
        _mintTokens(acl, _boardTokenManager, _boardMembers, 1);
    }

    function _setupShare(address[] _shareHolders, uint256[] _shareStakes, uint64 _shareVoteDuration, uint64 _shareSupportRequired, uint64 _shareMinAcceptanceQuorum) internal returns (TokenManager _shareTokenManager, Voting _shareVoting) {
        require(_shareHolders.length > 0, ERROR_MISSING_SHARE_MEMBERS);
        require(_shareHolders.length == _shareStakes.length, ERROR_BAD_HOLDERS_STAKES_LEN);
        (Kernel dao,, MiniMeToken shareToken) = _getCache(msg.sender);

        // Install apps
        ACL acl = ACL(dao.acl());
        _shareTokenManager = _installTokenManagerApp(dao, shareToken, SHARE_TRANSFERABLE, SHARE_MAX_PER_ACCOUNT);
        _shareVoting = _installVotingApp(dao, shareToken, _shareSupportRequired, _shareMinAcceptanceQuorum, _shareVoteDuration);

        // Mint tokens
        _mintTokens(acl, _shareTokenManager, _shareHolders, _shareStakes);
    }

    function _setupPermissions(
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
        (Kernel dao,,) = _getCache(msg.sender);
        ACL acl = ACL(dao.acl());
        _createVaultPermissions(acl, _agentOrVault, _finance, _shareVoting);
        if (_useAgentAsVault) {
            _createCustomAgentPermissions(acl, Agent(_agentOrVault), _boardVoting, _shareVoting);
        }
        _createCustomFinancePermissions(acl, _finance, _boardVoting, _shareVoting);
        _createCustomTokenManagerPermissions(acl, _boardTokenManager, _shareVoting);
        _createCustomTokenManagerPermissions(acl, _shareTokenManager, _shareVoting);
        _createEvmScriptsRegistryPermissions(acl, _shareVoting, _shareVoting);
        _createCustomVotingPermissions(acl, _boardVoting, _shareVoting, _boardTokenManager);
        _transferRootPermissionsFromTemplate(dao, _boardVoting, _shareVoting);
    }

    function _registerDAO(string _id) internal {
        (Kernel dao,,) = _popCache(msg.sender);
        _registerID(_id, dao);
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

    function _getCache(address _owner) internal view returns (Kernel dao, MiniMeToken boardToken, MiniMeToken shareToken) {
        Cache storage c = cache[_owner];
        require(c.dao != address(0) && c.boardToken != address(0) && c.shareToken != address(0), ERROR_MISSING_DAO_CACHE);

        dao = Kernel(c.dao);
        boardToken = MiniMeToken(c.boardToken);
        shareToken = MiniMeToken(c.shareToken);
    }

    function _popCache(address _owner) internal returns (Kernel dao, MiniMeToken boardToken, MiniMeToken shareToken) {
        (dao, boardToken, shareToken) = _getCache(_owner);
        delete cache[_owner];
    }
}
