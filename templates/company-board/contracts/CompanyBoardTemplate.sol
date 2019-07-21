pragma solidity 0.4.24;

import "@aragon/templates-shared/contracts/BaseTemplate.sol";


contract CompanyBoardTemplate is BaseTemplate {
    string private constant ERROR_MISSING_DAO_CACHE = "COMPANY_MISSING_DAO_CACHE";
    string private constant ERROR_MISSING_BOARD_MEMBERS = "COMPANY_MISSING_BOARD_MEMBERS";
    string private constant ERROR_INVALID_HOLDERS_STAKES_LEN = "COMPANY_INVALID_HOLDERS_STAKES_LEN";

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

    function newTokensAndInstance(string id, address[] boardMembers, address[] shareHolders, uint256[] shareStakes) public {
        require(boardMembers.length > 0, ERROR_MISSING_BOARD_MEMBERS);
        require(shareHolders.length == shareStakes.length, ERROR_INVALID_HOLDERS_STAKES_LEN);

        newTokens();
        prepareInstance(id);
        setupInstance(boardMembers, shareHolders, shareStakes);
    }

    function newTokens() public {
        MiniMeToken boardToken = _createToken(BOARD_TOKEN_NAME, BOARD_TOKEN_SYMBOL);
        MiniMeToken shareToken = _createToken(SHARE_TOKEN_NAME, SHARE_TOKEN_SYMBOL);
        _cacheTokens(boardToken, shareToken, msg.sender);
    }

    function prepareInstance(string id) public {
        (Kernel dao,) = _createDAO();
        _registerID(id, dao);
        _cacheDAO(dao, msg.sender);
    }

    function setupInstance(address[] boardMembers, address[] shareHolders, uint256[] shareStakes) public {
        require(boardMembers.length > 0, ERROR_MISSING_BOARD_MEMBERS);
        require(shareHolders.length == shareStakes.length, ERROR_INVALID_HOLDERS_STAKES_LEN);
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
        _mintBoardTokens(acl, boardTokenManager, boardMembers);
        _mintShareTokens(acl, shareTokenManager, shareHolders, shareStakes);

        // Set up permissions
        _createVaultPermissions(acl, Vault(agent), finance, shareVoting);
        _createCustomAgentPermissions(acl, agent, boardVoting, shareVoting);
        _createCustomFinancePermissions(acl, finance, boardVoting, shareVoting);
        _createCustomTokenManagerPermissions(acl, boardTokenManager, shareVoting);
        _createCustomTokenManagerPermissions(acl, shareTokenManager, shareVoting);
        _createEvmScriptsRegistryPermissions(acl, shareVoting, shareVoting);
        _createCustomVotingPermissions(acl, boardVoting, shareVoting, boardTokenManager);
        _transferPermissionFromTemplate(acl, boardVoting, shareVoting, dao, dao.APP_MANAGER_ROLE());
        _transferPermissionFromTemplate(acl, boardVoting, shareVoting, acl, acl.CREATE_PERMISSIONS_ROLE());
    }

    function _mintShareTokens(ACL acl, TokenManager shareTokenManager, address[] shareHolders, uint256[] shareStakes) internal {
        _createPermissionForTemplate(acl, shareTokenManager, shareTokenManager.MINT_ROLE());
        for (uint256 i = 0; i < shareHolders.length; i++) {
            shareTokenManager.mint(shareHolders[i], shareStakes[i]);
        }
        _removePermissionFromTemplate(acl, shareTokenManager, shareTokenManager.MINT_ROLE());
    }

    function _mintBoardTokens(ACL acl, TokenManager boardTokenManager, address[] boardMembers) internal {
        _createPermissionForTemplate(acl, boardTokenManager, boardTokenManager.MINT_ROLE());
        for (uint256 i = 0; i < boardMembers.length; i++) {
            boardTokenManager.mint(boardMembers[i], 1);
        }
        _removePermissionFromTemplate(acl, boardTokenManager, boardTokenManager.MINT_ROLE());
    }

    function _createCustomAgentPermissions(ACL acl, Agent agent, Voting boardVoting, Voting shareVoting) internal {
        address[] memory grantees = new address[](2);
        grantees[0] = address(boardVoting);
        grantees[1] = address(shareVoting);

        _createPermissions(acl, grantees, agent, agent.EXECUTE_ROLE(), shareVoting);
        _createPermissions(acl, grantees, agent, agent.RUN_SCRIPT_ROLE(), shareVoting);
    }

    function _createCustomFinancePermissions(ACL acl, Finance finance, Voting boardVoting, Voting shareVoting) internal {
        address[] memory grantees = new address[](2);
        grantees[0] = address(boardVoting);
        grantees[1] = address(shareVoting);

        _createPermissions(acl, grantees, finance, finance.CREATE_PAYMENTS_ROLE(), shareVoting);
        acl.createPermission(shareVoting, finance, finance.EXECUTE_PAYMENTS_ROLE(), shareVoting);
        acl.createPermission(shareVoting, finance, finance.MANAGE_PAYMENTS_ROLE(), shareVoting);
    }

    function _createCustomVotingPermissions(ACL acl, Voting boardVoting, Voting shareVoting, TokenManager boardTokenManager) internal {
        acl.createPermission(boardTokenManager, boardVoting, boardVoting.CREATE_VOTES_ROLE(), shareVoting);
        acl.createPermission(shareVoting, boardVoting, boardVoting.MODIFY_QUORUM_ROLE(), shareVoting);
        acl.createPermission(shareVoting, boardVoting, boardVoting.MODIFY_SUPPORT_ROLE(), shareVoting);

        acl.createPermission(boardTokenManager, shareVoting, shareVoting.CREATE_VOTES_ROLE(), shareVoting);
        acl.createPermission(shareVoting, shareVoting, shareVoting.MODIFY_QUORUM_ROLE(), shareVoting);
        acl.createPermission(shareVoting, shareVoting, shareVoting.MODIFY_SUPPORT_ROLE(), shareVoting);
    }

    function _createCustomTokenManagerPermissions(ACL acl, TokenManager tokenManager, Voting voting) internal {
        acl.createPermission(voting, tokenManager, tokenManager.BURN_ROLE(), voting);
        acl.createPermission(voting, tokenManager, tokenManager.MINT_ROLE(), voting);
    }

    function _cacheTokens(MiniMeToken boardToken, MiniMeToken shareToken, address owner) internal {
        Cache storage c = cache[owner];
        c.boardToken = address(boardToken);
        c.shareToken = address(shareToken);
    }

    function _cacheDAO(Kernel dao, address owner) internal {
        Cache storage c = cache[owner];
        c.dao = address(dao);
    }

    function _popCache(address owner) internal returns (Kernel dao, MiniMeToken boardToken, MiniMeToken shareToken) {
        Cache storage c = cache[owner];
        require(c.dao != address(0) && c.boardToken != address(0) && c.shareToken != address(0), ERROR_MISSING_DAO_CACHE);

        dao = Kernel(c.dao);
        boardToken = MiniMeToken(c.boardToken);
        shareToken = MiniMeToken(c.shareToken);
        delete cache[owner];
    }
}
