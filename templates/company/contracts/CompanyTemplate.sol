pragma solidity 0.4.24;

import "@aragon/templates-shared/contracts/BaseTemplate.sol";


contract CompanyTemplate is BaseTemplate {
    string constant private ERROR_MISSING_TOKEN_CACHE = "COMPANY_MISSING_TOKEN_CACHE";
    string constant private ERROR_EMPTY_HOLDERS = "COMPANY_EMPTY_HOLDERS";
    string constant private ERROR_BAD_HOLDERS_STAKES_LEN = "COMPANY_BAD_HOLDERS_STAKES_LEN";

    bool constant private TOKEN_TRANSFERABLE = true;
    uint8 constant private TOKEN_DECIMALS = uint8(18);
    uint256 constant private TOKEN_MAX_PER_ACCOUNT = uint256(0);            // no limit of tokens per account

    uint64 constant private DEFAULT_FINANCE_PERIOD = uint64(30 days);

    mapping (address => address) internal tokenCache;

    constructor(DAOFactory _daoFactory, ENS _ens, MiniMeTokenFactory _miniMeFactory, IFIFSResolvingRegistrar _aragonID)
        BaseTemplate(_daoFactory, _ens, _miniMeFactory, _aragonID)
        public
    {
        _ensureAragonIdIsValid(_aragonID);
        _ensureMiniMeFactoryIsValid(_miniMeFactory);
    }

    function newTokenAndInstance(
        string _id, 
        address[] _holders, 
        uint256[] _stakes, 
        string _tokenName, 
        string _tokenSymbol,
        uint64 _voteDuration,
        uint64 _supportRequired,
        uint64 _minAcceptanceQuorum,
        uint64 _financePeriod
    ) 
        public 
    {
        newToken(_tokenName, _tokenSymbol);
        newInstance(_id, _holders, _stakes, _voteDuration, _supportRequired, _minAcceptanceQuorum, _financePeriod);
    }

    function newToken(string _name, string _symbol) public returns (MiniMeToken) {
        MiniMeToken token = _createToken(_name, _symbol, TOKEN_DECIMALS);
        _cacheToken(token, msg.sender);
        return token;
    }

    function newInstance(string _id, address[] _holders, uint256[] _stakes, uint64 _voteDuration, uint64 _supportRequired, uint64 _minAcceptanceQuorum, uint64 _financePeriod) public {
        require(_holders.length > 0, ERROR_EMPTY_HOLDERS);
        require(_holders.length == _stakes.length, ERROR_BAD_HOLDERS_STAKES_LEN);
        MiniMeToken token = _popTokenCache(msg.sender);

        // Create DAO and install apps
        (Kernel dao, ACL acl) = _createDAO();
        Agent agent = _installDefaultAgentApp(dao);
        Finance finance = _installFinanceApp(dao, Vault(agent), _financePeriod == 0 ? DEFAULT_FINANCE_PERIOD : _financePeriod);
        TokenManager tokenManager = _installTokenManagerApp(dao, token, TOKEN_TRANSFERABLE, TOKEN_MAX_PER_ACCOUNT);
        Voting voting = _installVotingApp(dao, token, _supportRequired, _minAcceptanceQuorum, _voteDuration);

        _mintTokens(acl, tokenManager, _holders, _stakes);

        _setupPermissions(dao, acl, agent, voting, finance, tokenManager);

        _registerID(_id, dao);
    }

    function _mintTokens(ACL _acl, TokenManager _tokenManager, address[] _holders, uint256[] _stakes) internal {
        _createPermissionForTemplate(_acl, _tokenManager, _tokenManager.MINT_ROLE());
        for (uint256 i = 0; i < _holders.length; i++) {
            _tokenManager.mint(_holders[i], _stakes[i]);
        }
        _removePermissionFromTemplate(_acl, _tokenManager, _tokenManager.MINT_ROLE());
    }

    function _setupPermissions(Kernel _dao, ACL _acl, Agent _agent, Voting _voting, Finance _finance, TokenManager _tokenManager) internal {
        _createAgentPermissions(_acl, _agent, _voting, _voting);
        _createVaultPermissions(_acl, Vault(_agent), _finance, _voting);
        _createFinancePermissions(_acl, _finance, _voting, _voting);
        _createEvmScriptsRegistryPermissions(_acl, _voting, _voting);
        _createCustomVotingPermissions(_acl, _voting, _tokenManager);
        _createCustomTokenManagerPermissions(_acl, _tokenManager, _voting);
        _transferRootPermissionsFromTemplate(_dao, _voting);
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
