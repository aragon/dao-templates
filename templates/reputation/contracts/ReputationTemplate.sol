pragma solidity 0.4.24;

import "@aragon/templates-shared/contracts/BaseTemplate.sol";


contract ReputationTemplate is BaseTemplate {
    string constant private ERROR_MISSING_TOKEN_CACHE = "REPUTATION_MISSING_TOKEN_CACHE";
    string constant private ERROR_EMPTY_HOLDERS = "REPUTATION_EMPTY_HOLDERS";
    string constant private ERROR_BAD_HOLDERS_STAKES_LEN = "REPUTATION_BAD_HOLDERS_STAKES_LEN";
    string constant private ERROR_BAD_VOTE_SETTINGS = "REPUTATION_BAD_VOTE_SETTINGS";

    bool constant private TOKEN_TRANSFERABLE = false;
    uint8 constant private TOKEN_DECIMALS = uint8(18);
    uint256 constant private TOKEN_MAX_PER_ACCOUNT = uint256(0);

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
        string _tokenName,
        string _tokenSymbol,
        string _id,
        address[] _holders,
        uint256[] _stakes,
        uint64[3] _votingSettings, /* supportRequired, minAcceptanceQuorum, voteDuration */
        uint64 _financePeriod,
        bool _useAgentAsVault
    )
        external
    {
        newToken(_tokenName, _tokenSymbol);
        newInstance(_id, _holders, _stakes, _votingSettings, _financePeriod, _useAgentAsVault);
    }

    function newToken(string _name, string _symbol) public returns (MiniMeToken) {
        MiniMeToken token = _createToken(_name, _symbol, TOKEN_DECIMALS);
        _cacheToken(token, msg.sender);
        return token;
    }

    function newInstance(string _id, address[] _holders, uint256[] _stakes, uint64[3] _votingSettings, uint64 _financePeriod, bool _useAgentAsVault)
        public 
    {
        require(_holders.length > 0, ERROR_EMPTY_HOLDERS);
        require(_holders.length == _stakes.length, ERROR_BAD_HOLDERS_STAKES_LEN);
        require(_votingSettings.length == 3, ERROR_BAD_VOTE_SETTINGS);
        MiniMeToken token = _popTokenCache(msg.sender);

        // Create DAO and install apps
        (Kernel dao, ACL acl) = _createDAO();
        Vault agentOrVault = _useAgentAsVault ? _installDefaultAgentApp(dao) : _installVaultApp(dao);
        Finance finance = _installFinanceApp(dao, agentOrVault, _financePeriod == 0 ? DEFAULT_FINANCE_PERIOD : _financePeriod);
        TokenManager tokenManager = _installTokenManagerApp(dao, token, TOKEN_TRANSFERABLE, TOKEN_MAX_PER_ACCOUNT);
        Voting voting = _installVotingApp(dao, token, _votingSettings[0], _votingSettings[1], _votingSettings[2]);

        // Mint tokens
        _mintTokens(acl, tokenManager, _holders, _stakes);

        // Set up permissions
        if (_useAgentAsVault) {
            _createAgentPermissions(acl, Agent(agentOrVault), voting, voting);
        }
        _createVaultPermissions(acl, agentOrVault, finance, voting);
        _createFinancePermissions(acl, finance, voting, voting);
        _createEvmScriptsRegistryPermissions(acl, voting, voting);
        _createCustomVotingPermissions(acl, voting, tokenManager);
        _createCustomTokenManagerPermissions(acl, tokenManager, voting);
        _transferRootPermissionsFromTemplate(dao, voting);

        _registerID(_id, dao);
    }

    function _createCustomVotingPermissions(ACL _acl, Voting _voting, TokenManager _tokenManager) internal {
        _acl.createPermission(_tokenManager, _voting, _voting.CREATE_VOTES_ROLE(), _voting);
        _createVotingPermissions(_acl, _voting, _voting, _voting);
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
