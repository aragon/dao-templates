pragma solidity 0.4.24;

import "@aragon/templates-shared/contracts/BaseTemplate.sol";


contract CompanyTemplate is BaseTemplate {
    string private constant ERROR_MISSING_TOKEN_CACHE = "COMPANY_MISSING_TOKEN_CACHE";
    string private constant ERROR_EMPTY_HOLDERS = "COMPANY_EMPTY_HOLDERS";
    string private constant ERROR_BAD_HOLDERS_STAKES_LEN = "COMPANY_BAD_HOLDERS_STAKES_LEN";

    bool constant private TOKEN_TRANSFERABLE = true;
    string constant private TOKEN_NAME = "Share Token";
    string constant private TOKEN_SYMBOL = "SHARE";
    uint8 constant private TOKEN_DECIMALS = uint8(18);
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

    function newTokenAndInstance(string _id, address[] _holders, uint256[] _stakes) public {
        newToken();
        newInstance(_id, _holders, _stakes);
    }

    function newToken() public returns (MiniMeToken) {
        MiniMeToken token = _createToken(TOKEN_NAME, TOKEN_SYMBOL, TOKEN_DECIMALS);
        _cacheToken(token, msg.sender);
        return token;
    }

    function newInstance(string _id, address[] _holders, uint256[] _stakes) public {
        require(_holders.length > 0, ERROR_EMPTY_HOLDERS);
        require(_holders.length == _stakes.length, ERROR_BAD_HOLDERS_STAKES_LEN);
        MiniMeToken token = _popTokenCache(msg.sender);

        // Create DAO and install apps
        (Kernel dao, ACL acl) = _createDAO();
        Agent agent = _installDefaultAgentApp(dao);
        Finance finance = _installFinanceApp(dao, Vault(agent), FINANCE_PERIOD);
        TokenManager tokenManager = _installTokenManagerApp(dao, token, TOKEN_TRANSFERABLE, TOKEN_MAX_PER_ACCOUNT);
        Voting voting = _installVotingApp(dao, token, SUPPORT_REQUIRED, MIN_ACCEPTANCE_QUORUM, VOTE_DURATION);

        // Mint tokens
        _createPermissionForTemplate(acl, tokenManager, tokenManager.MINT_ROLE());
        for (uint256 i = 0; i < _holders.length; i++) {
            tokenManager.mint(_holders[i], _stakes[i]);
        }
        _removePermissionFromTemplate(acl, tokenManager, tokenManager.MINT_ROLE());

        // Set up permissions
        _createAgentPermissions(acl, agent, voting, voting);
        _createVaultPermissions(acl, Vault(agent), finance, voting);
        _createFinancePermissions(acl, finance, voting, voting);
        _createEvmScriptsRegistryPermissions(acl, voting, voting);
        _createCustomVotingPermissions(acl, voting, tokenManager);
        _createCustomTokenManagerPermissions(acl, tokenManager, voting);
        _transferRootPermissionsFromTemplate(dao, voting);

        _registerID(_id, dao);
    }

    function _createCustomVotingPermissions(ACL _acl, Voting _voting, TokenManager _tokenManager) internal {
        _acl.createPermission(_tokenManager, _voting, _voting.CREATE_VOTES_ROLE(), _voting);
        _acl.createPermission(_voting, _voting, _voting.MODIFY_QUORUM_ROLE(), _voting);
        _acl.createPermission(_voting, _voting, _voting.MODIFY_SUPPORT_ROLE(), _voting);
    }

    function _createCustomTokenManagerPermissions(ACL _acl, TokenManager _tokenManager, Voting _voting) internal {
        _acl.createPermission(_voting, _tokenManager, _tokenManager.BURN_ROLE(), _voting);
        _acl.createPermission(_voting, _tokenManager, _tokenManager.MINT_ROLE(), _voting);
    }

    function _cacheToken(MiniMeToken _token, address _owner) internal {
        tokenCache[_owner] = _token;
    }

    function _popTokenCache(address _owner) internal returns (MiniMeToken) {
        require(tokenCache[_owner] != address(0), ERROR_MISSING_TOKEN_CACHE);

        MiniMeToken token = MiniMeToken(tokenCache[_owner]);
        delete tokenCache[_owner];
        return token;
    }
}
