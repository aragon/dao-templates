pragma solidity 0.4.24;

import "@aragon/templates-shared/contracts/BaseTemplate.sol";


contract MembershipTemplate is BaseTemplate {
    string private constant ERROR_MISSING_MEMBERS = "MEMBERSHIP_MISSING_MEMBERS";
    string private constant ERROR_MISSING_TOKEN_CACHE = "MEMBERSHIP_MISSING_TOKEN_CACHE";

    bool constant private TOKEN_TRANSFERABLE = false;
    string constant private TOKEN_NAME = "Member Token";
    string constant private TOKEN_SYMBOL = "MEMBER";
    uint256 constant private TOKEN_MAX_PER_ACCOUNT = uint256(1);

    uint64 constant private ONE_PCT = uint64(1e16);                         // 1%
    uint64 constant private FINANCE_PERIOD = uint64(30 days);               // 30 days
    uint64 constant private VOTE_DURATION = uint64(7 days);                 // 1 week
    uint64 constant private SUPPORT_REQUIRED = uint64(50 * ONE_PCT);        // 50%
    uint64 constant private MIN_ACCEPTANCE_QUORUM = uint64(20 * ONE_PCT);   // 20%

    mapping (address => address) internal tokenCache;

    constructor(DAOFactory _daoFactory, ENS _ens, MiniMeTokenFactory _miniMeFactory, IFIFSResolvingRegistrar _aragonID)
        BaseTemplate(_daoFactory, _ens, _miniMeFactory, _aragonID)
        public
    {
        _ensureAragonIdIsValid(_aragonID);
        _ensureMiniMeFactoryIsValid(_miniMeFactory);
    }

    function newTokenAndInstance(string id, address[] members) public {
        require(members.length > 0, ERROR_MISSING_MEMBERS);
        newToken();
        newInstance(id, members);
    }

    function newToken() public returns (MiniMeToken) {
        MiniMeToken token = _createToken(TOKEN_NAME, TOKEN_SYMBOL);
        _cacheToken(token, msg.sender);
        return token;
    }

    function newInstance(string id, address[] members) public {
        require(members.length > 0, ERROR_MISSING_MEMBERS);
        MiniMeToken token = _popTokenCache(msg.sender);

        // Create DAO and install apps
        (Kernel dao, ACL acl) = _createDAO();
        Agent agent = _installDefaultAgentApp(dao);
        Finance finance = _installFinanceApp(dao, Vault(agent), FINANCE_PERIOD);
        TokenManager tokenManager = _installTokenManagerApp(dao, token, TOKEN_TRANSFERABLE, TOKEN_MAX_PER_ACCOUNT);
        Voting voting = _installVotingApp(dao, token, SUPPORT_REQUIRED, MIN_ACCEPTANCE_QUORUM, VOTE_DURATION);

        // Mint tokens
        _mintTokens(acl, tokenManager, members);

        // Set up permissions
        _createAgentPermissions(acl, agent, voting, voting);
        _createVaultPermissions(acl, Vault(agent), finance, voting);
        _createFinancePermissions(acl, finance, voting, voting);
        _createEvmScriptsRegistryPermissions(acl, voting, voting);
        _createCustomVotingPermissions(acl, voting, tokenManager);
        _createCustomTokenManagerPermissions(acl, tokenManager, voting);
        _transferPermissionFromTemplate(acl, voting, dao, dao.APP_MANAGER_ROLE());
        _transferPermissionFromTemplate(acl, voting, acl, acl.CREATE_PERMISSIONS_ROLE());

        _registerID(id, dao);
    }

    function _mintTokens(ACL acl, TokenManager tokenManager, address[] members) internal {
        _createPermissionForTemplate(acl, tokenManager, tokenManager.MINT_ROLE());
        for (uint256 i = 0; i < members.length; i++) {
            tokenManager.mint(members[i], 1);
        }
        _removePermissionFromTemplate(acl, tokenManager, tokenManager.MINT_ROLE());
    }

    function _createCustomVotingPermissions(ACL acl, Voting voting, TokenManager tokenManager) internal {
        acl.createPermission(tokenManager, voting, voting.CREATE_VOTES_ROLE(), voting);
        acl.createPermission(voting, voting, voting.MODIFY_QUORUM_ROLE(), voting);
        acl.createPermission(voting, voting, voting.MODIFY_SUPPORT_ROLE(), voting);
    }

    function _createCustomTokenManagerPermissions(ACL acl, TokenManager tokenManager, Voting voting) internal {
        acl.createPermission(voting, tokenManager, tokenManager.BURN_ROLE(), voting);
        acl.createPermission(voting, tokenManager, tokenManager.MINT_ROLE(), voting);
    }

    function _cacheToken(MiniMeToken token, address owner) internal {
        tokenCache[owner] = token;
    }

    function _popTokenCache(address owner) internal returns (MiniMeToken) {
        require(tokenCache[owner] != address(0), ERROR_MISSING_TOKEN_CACHE);

        MiniMeToken token = MiniMeToken(tokenCache[owner]);
        delete tokenCache[owner];
        return token;
    }
}
