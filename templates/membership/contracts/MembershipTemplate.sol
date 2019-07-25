pragma solidity 0.4.24;

import "@aragon/templates-shared/contracts/BaseTemplate.sol";


contract MembershipTemplate is BaseTemplate {
    string constant private ERROR_MISSING_MEMBERS = "MEMBERSHIP_MISSING_MEMBERS";
    string constant private ERROR_MISSING_TOKEN_CACHE = "MEMBERSHIP_MISSING_TOKEN_CACHE";

    bool constant private TOKEN_TRANSFERABLE = false;
    uint8 constant private TOKEN_DECIMALS = uint8(0);
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

    function newTokenAndInstance(string _id, address[] _members, string _tokenName, string _tokenSymbol) public {
        newToken(_tokenName, _tokenSymbol);
        newInstance(_id, _members);
    }

    function newToken(string _name, string _symbol) public returns (MiniMeToken) {
        MiniMeToken token = _createToken(_name, _symbol, TOKEN_DECIMALS);
        _cacheToken(token, msg.sender);
        return token;
    }

    function newInstance(string _id, address[] _members) public {
        require(_members.length > 0, ERROR_MISSING_MEMBERS);
        MiniMeToken token = _popTokenCache(msg.sender);

        // Create DAO and install apps
        (Kernel dao, ACL acl) = _createDAO();
        Agent agent = _installDefaultAgentApp(dao);
        Finance finance = _installFinanceApp(dao, Vault(agent), FINANCE_PERIOD);
        TokenManager tokenManager = _installTokenManagerApp(dao, token, TOKEN_TRANSFERABLE, TOKEN_MAX_PER_ACCOUNT);
        Voting voting = _installVotingApp(dao, token, SUPPORT_REQUIRED, MIN_ACCEPTANCE_QUORUM, VOTE_DURATION);

        // Mint tokens
        _mintTokens(acl, tokenManager, _members);

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

    function _mintTokens(ACL _acl, TokenManager _tokenManager, address[] _members) internal {
        _createPermissionForTemplate(_acl, _tokenManager, _tokenManager.MINT_ROLE());
        for (uint256 i = 0; i < _members.length; i++) {
            _tokenManager.mint(_members[i], 1);
        }
        _removePermissionFromTemplate(_acl, _tokenManager, _tokenManager.MINT_ROLE());
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

    function _cacheToken(MiniMeToken token, address _owner) internal {
        tokenCache[_owner] = token;
    }

    function _popTokenCache(address _owner) internal returns (MiniMeToken) {
        require(tokenCache[_owner] != address(0), ERROR_MISSING_TOKEN_CACHE);

        MiniMeToken token = MiniMeToken(tokenCache[_owner]);
        delete tokenCache[_owner];
        return token;
    }
}
