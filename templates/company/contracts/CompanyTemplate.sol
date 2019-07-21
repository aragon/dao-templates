pragma solidity 0.4.24;

import "@aragon/templates-shared/contracts/BaseTemplate.sol";


contract CompanyTemplate is BaseTemplate {
    string private constant ERROR_MISSING_TOKEN_CACHE = "COMPANY_MISSING_TOKEN_CACHE";
    string private constant ERROR_INVALID_HOLDERS_STAKES_LEN = "COMPANY_INVALID_HOLDERS_STAKES_LEN";

    bool constant private TOKEN_TRANSFERABLE = true;
    string constant private TOKEN_NAME = "Share Token";
    string constant private TOKEN_SYMBOL = "SHARE";
    uint256 constant private TOKEN_MAX_PER_ACCOUNT = uint256(0);            // no limit of tokens per account
    uint64 constant private ONE_PCT = uint64(1e16);                         // 1%
    uint64 constant private SUPPORT_REQUIRED = uint64(50 * ONE_PCT);        // 50%
    uint64 constant private MIN_ACCEPTANCE_QUORUM = uint64(5 * ONE_PCT);    // 5%
    uint64 constant private VOTE_DURATION = uint64(7 days);                 // 1 week
    uint64 constant private FINANCE_PERIOD = uint64(30 days);               // 30 days

    mapping (address => address) internal tokenCache;

    constructor(DAOFactory _daoFactory, ENS _ens, MiniMeTokenFactory _miniMeFactory, IFIFSResolvingRegistrar _aragonID)
        BaseTemplate(_daoFactory, _ens, _miniMeFactory, _aragonID)
        public
    {
        _ensureAragonIdIsValid(_aragonID);
        _ensureMiniMeFactoryIsValid(_miniMeFactory);
    }

    function newTokenAndInstance(string id, address[] holders, uint256[] stakes) public {
        require(holders.length == stakes.length, ERROR_INVALID_HOLDERS_STAKES_LEN);
        newToken();
        newInstance(id, holders, stakes);
    }

    function newToken() public returns (MiniMeToken) {
        MiniMeToken token = _createToken(TOKEN_NAME, TOKEN_SYMBOL);
        _cacheToken(token, msg.sender);
        return token;
    }

    function newInstance(string id, address[] holders, uint256[] stakes) public {
        require(holders.length == stakes.length, ERROR_INVALID_HOLDERS_STAKES_LEN);
        MiniMeToken token = _popTokenCache(msg.sender);

        // Create DAO and install apps
        (Kernel dao, ACL acl) = _createDAO();
        Agent agent = _installDefaultAgentApp(dao);
        Finance finance = _installFinanceApp(dao, Vault(agent), FINANCE_PERIOD);
        TokenManager tokenManager = _installTokenManagerApp(dao, token, TOKEN_TRANSFERABLE, TOKEN_MAX_PER_ACCOUNT);
        Voting voting = _installVotingApp(dao, token, SUPPORT_REQUIRED, MIN_ACCEPTANCE_QUORUM, VOTE_DURATION);

        // Mint tokens
        _createPermissionForTemplate(acl, tokenManager, tokenManager.MINT_ROLE());
        for (uint256 i = 0; i < holders.length; i++) {
            tokenManager.mint(holders[i], stakes[i]);
        }
        _removePermissionFromTemplate(acl, tokenManager, tokenManager.MINT_ROLE());

        // Set up permissions
        _createAgentPermissions(acl, agent, voting, voting);
        _createVaultPermissions(acl, Vault(agent), finance, voting);
        _createFinancePermissions(acl, finance, voting, voting);
        _createTokenManagerPermissions(acl, tokenManager, voting);
        _createEvmScriptsRegistryPermissions(acl, voting, voting);
        _createVotingPermissions(acl, voting, tokenManager);
        _transferPermissionFromTemplate(acl, voting, dao, dao.APP_MANAGER_ROLE());
        _transferPermissionFromTemplate(acl, voting, acl, acl.CREATE_PERMISSIONS_ROLE());

        _registerID(id, dao);
    }

    function _createVotingPermissions(ACL acl, Voting voting, TokenManager tokenManager) internal {
        acl.createPermission(tokenManager, voting, voting.CREATE_VOTES_ROLE(), voting);
        acl.createPermission(voting, voting, voting.MODIFY_QUORUM_ROLE(), voting);
        acl.createPermission(voting, voting, voting.MODIFY_SUPPORT_ROLE(), voting);
    }

    function _createTokenManagerPermissions(ACL acl, TokenManager tokenManager, Voting voting) internal {
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
