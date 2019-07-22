pragma solidity 0.4.24;

import "@aragon/templates-shared/contracts/BaseTemplate.sol";


contract CompanyBoardTemplate is BaseTemplate {
    string private constant ERROR_MISSING_DAO_CACHE = "COMPANY_MISSING_DAO_CACHE";
    string private constant ERROR_MISSING_BOARD_MEMBERS = "COMPANY_MISSING_BOARD_MEMBERS";
    string private constant ERROR_BAD_HOLDERS_STAKES_LEN = "COMPANY_BAD_HOLDERS_STAKES_LEN";

    uint64 constant private ONE_PCT = uint64(1e16);
    uint64 constant private FINANCE_PERIOD = uint64(30 days);

    bool constant private BOARD_TRANSFERABLE = false;
    string constant private BOARD_TOKEN_NAME = "Board Token";
    string constant private BOARD_TOKEN_SYMBOL = "BOARD";
    uint256 constant private BOARD_MAX_PER_ACCOUNT = uint256(1);

    bool constant private SHARE_TRANSFERABLE = true;
    string constant private SHARE_TOKEN_NAME = "Share Token";
    string constant private SHARE_TOKEN_SYMBOL = "SHARE";
    uint256 constant private SHARE_MAX_PER_ACCOUNT = uint256(0);

    uint64 constant private BOARD_VOTE_DURATION = uint64(7 days);                 // 1 week
    uint64 constant private BOARD_SUPPORT_REQUIRED = uint64(50 * ONE_PCT);        // 50%
    uint64 constant private BOARD_MIN_ACCEPTANCE_QUORUM = uint64(40 * ONE_PCT);   // 40%

    uint64 constant private SHARE_VOTE_DURATION = uint64(7 days);                 // 1 week
    uint64 constant private SHARE_SUPPORT_REQUIRED = uint64(50 * ONE_PCT);        // 50%
    uint64 constant private SHARE_MIN_ACCEPTANCE_QUORUM = uint64(5 * ONE_PCT);    // 5%

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

    function newTokensAndInstance(string _id, address[] _boardMembers, address[] _shareHolders, uint256[] _shareStakes) public {
        require(_boardMembers.length > 0, ERROR_MISSING_BOARD_MEMBERS);
        require(_shareHolders.length == _shareStakes.length, ERROR_BAD_HOLDERS_STAKES_LEN);

        newTokens();
        prepareInstance(_id);
        setupInstance(_boardMembers, _shareHolders, _shareStakes);
    }

    function newTokens() public {
        MiniMeToken boardToken = _createToken(BOARD_TOKEN_NAME, BOARD_TOKEN_SYMBOL);
        MiniMeToken shareToken = _createToken(SHARE_TOKEN_NAME, SHARE_TOKEN_SYMBOL);
        _cacheTokens(boardToken, shareToken, msg.sender);
    }

    function prepareInstance(string _id) public {
        (Kernel dao,) = _createDAO();
        _registerID(_id, dao);
        _cacheDAO(dao, msg.sender);
    }

    function setupInstance(address[] _boardMembers, address[] _shareHolders, uint256[] _shareStakes) public {
        require(_boardMembers.length > 0, ERROR_MISSING_BOARD_MEMBERS);
        require(_shareHolders.length == _shareStakes.length, ERROR_BAD_HOLDERS_STAKES_LEN);
        (Kernel dao, MiniMeToken boardToken, MiniMeToken shareToken) = _popCache(msg.sender);

        // Install apps
        ACL acl = ACL(dao.acl());
        Agent agent = _installDefaultAgentApp(dao);
        Finance finance = _installFinanceApp(dao, Vault(agent), FINANCE_PERIOD);
        TokenManager boardTokenManager = _installTokenManagerApp(dao, boardToken, BOARD_TRANSFERABLE, BOARD_MAX_PER_ACCOUNT);
        TokenManager shareTokenManager = _installTokenManagerApp(dao, shareToken, SHARE_TRANSFERABLE, SHARE_MAX_PER_ACCOUNT);
        Voting boardVoting = _installVotingApp(dao, boardToken, BOARD_SUPPORT_REQUIRED, BOARD_MIN_ACCEPTANCE_QUORUM, BOARD_VOTE_DURATION);
        Voting shareVoting = _installVotingApp(dao, shareToken, SHARE_SUPPORT_REQUIRED, SHARE_MIN_ACCEPTANCE_QUORUM, SHARE_VOTE_DURATION);

        // Mint tokens
        _mintBoardTokens(acl, boardTokenManager, _boardMembers);
        _mintShareTokens(acl, shareTokenManager, _shareHolders, _shareStakes);

        // Set up permissions
        _createVaultPermissions(acl, Vault(agent), finance, shareVoting);
        _createCustomAgentPermissions(acl, agent, boardVoting, shareVoting);
        _createCustomFinancePermissions(acl, finance, boardVoting, shareVoting);
        _createCustomTokenManagerPermissions(acl, boardTokenManager, shareVoting);
        _createCustomTokenManagerPermissions(acl, shareTokenManager, shareVoting);
        _createEvmScriptsRegistryPermissions(acl, shareVoting, shareVoting);
        _createCustomVotingPermissions(acl, boardVoting, shareVoting, boardTokenManager);
        _transferRootPermissionsFromTemplate(dao, boardVoting, shareVoting);
    }

    function _mintShareTokens(ACL _acl, TokenManager _shareTokenManager, address[] _shareHolders, uint256[] _shareStakes) internal {
        _createPermissionForTemplate(_acl, _shareTokenManager, _shareTokenManager.MINT_ROLE());
        for (uint256 i = 0; i < _shareHolders.length; i++) {
            _shareTokenManager.mint(_shareHolders[i], _shareStakes[i]);
        }
        _removePermissionFromTemplate(_acl, _shareTokenManager, _shareTokenManager.MINT_ROLE());
    }

    function _mintBoardTokens(ACL _acl, TokenManager _boardTokenManager, address[] _boardMembers) internal {
        _createPermissionForTemplate(_acl, _boardTokenManager, _boardTokenManager.MINT_ROLE());
        for (uint256 i = 0; i < _boardMembers.length; i++) {
            _boardTokenManager.mint(_boardMembers[i], 1);
        }
        _removePermissionFromTemplate(_acl, _boardTokenManager, _boardTokenManager.MINT_ROLE());
    }

    function _createCustomAgentPermissions(ACL _acl, Agent _agent, Voting _boardVoting, Voting _shareVoting) internal {
        address[] memory grantees = new address[](2);
        grantees[0] = address(_boardVoting);
        grantees[1] = address(_shareVoting);

        _createPermissions(_acl, grantees, _agent, _agent.EXECUTE_ROLE(), _shareVoting);
        _createPermissions(_acl, grantees, _agent, _agent.RUN_SCRIPT_ROLE(), _shareVoting);
    }

    function _createCustomFinancePermissions(ACL _acl, Finance finance, Voting _boardVoting, Voting _shareVoting) internal {
        address[] memory grantees = new address[](2);
        grantees[0] = address(_boardVoting);
        grantees[1] = address(_shareVoting);

        _createPermissions(_acl, grantees, finance, finance.CREATE_PAYMENTS_ROLE(), _shareVoting);
        _acl.createPermission(_shareVoting, finance, finance.EXECUTE_PAYMENTS_ROLE(), _shareVoting);
        _acl.createPermission(_shareVoting, finance, finance.MANAGE_PAYMENTS_ROLE(), _shareVoting);
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

    function _cacheTokens(MiniMeToken _boardToken, MiniMeToken _shareToken, address _owner) internal {
        Cache storage c = cache[_owner];
        c.boardToken = address(_boardToken);
        c.shareToken = address(_shareToken);
    }

    function _cacheDAO(Kernel _dao, address _owner) internal {
        Cache storage c = cache[_owner];
        c.dao = address(_dao);
    }

    function _popCache(address _owner) internal returns (Kernel dao, MiniMeToken boardToken, MiniMeToken shareToken) {
        Cache storage c = cache[_owner];
        require(c.dao != address(0) && c.boardToken != address(0) && c.shareToken != address(0), ERROR_MISSING_DAO_CACHE);

        dao = Kernel(c.dao);
        boardToken = MiniMeToken(c.boardToken);
        shareToken = MiniMeToken(c.shareToken);
        delete cache[_owner];
    }
}
