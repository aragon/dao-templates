pragma solidity 0.4.24;

import "@aragon/templates-shared/contracts/BaseTemplate.sol";


contract DemocracyTemplate is BaseTemplate {
    uint8 constant private TOKEN_DECIMALS = uint8(18);
    bool constant private TOKEN_TRANSFERABLE = true;
    uint256 constant private TOKEN_MAX_PER_ACCOUNT = uint256(0);
    uint64 constant private FINANCE_PERIOD = uint64(30 days);      // 30 days

    string constant private ERROR_MISSING_TOKEN_CACHE = "DEMOCRACY_MISSING_TOKEN_CACHE";
    string constant private ERROR_BAD_HOLDERS_STAKES_LEN = "DEMOCRACY_BAD_HOLDERS_STAKES_LEN";

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
        uint64 _supportNeeded,
        uint64 _minAcceptanceQuorum,
        uint64 _voteDuration
    )
        public
    {
        newToken(_tokenName, _tokenSymbol);
        newInstance(_id, _holders, _stakes, _supportNeeded, _minAcceptanceQuorum, _voteDuration);
    }

    function newToken(string _name, string _symbol) public returns (MiniMeToken) {
        MiniMeToken token = _createToken(_name, _symbol, TOKEN_DECIMALS);
        _cacheToken(token, msg.sender);
        return token;
    }

    function newInstance(string _id, address[] _holders, uint256[] _stakes, uint64 _supportNeeded, uint64 _minAcceptanceQuorum, uint64 _voteDuration)
        public
    {
        require(_holders.length == _stakes.length, ERROR_BAD_HOLDERS_STAKES_LEN);
        MiniMeToken token = _popTokenCache(msg.sender);

        // Create DAO and install apps
        (Kernel dao, ACL acl) = _createDAO();
        Vault vault = _installVaultApp(dao);
        Finance finance = _installFinanceApp(dao, vault, FINANCE_PERIOD);
        TokenManager tokenManager = _installTokenManagerApp(dao, token, TOKEN_TRANSFERABLE, TOKEN_MAX_PER_ACCOUNT);
        Voting voting = _installVotingApp(dao, token, _supportNeeded, _minAcceptanceQuorum, _voteDuration);

        // Mint tokens
        _createPermissionForTemplate(acl, tokenManager, tokenManager.MINT_ROLE());
        for (uint256 i = 0; i < _holders.length; i++) {
            tokenManager.mint(_holders[i], _stakes[i]);
        }
        _removePermissionFromTemplate(acl, tokenManager, tokenManager.MINT_ROLE());

        // Set up permissions
        _createVaultPermissions(acl, vault, finance, voting);
        _createFinancePermissions(acl, finance, voting, voting);
        _createTokenManagerPermissions(acl, tokenManager, voting, voting);
        _createEvmScriptsRegistryPermissions(acl, voting, voting);
        _createCustomVotingPermissions(acl, voting, tokenManager);
        _transferRootPermissionsFromTemplate(dao, voting);

        _registerID(_id, dao);
    }

    function _createCustomVotingPermissions(ACL _acl, Voting _voting, TokenManager _tokenManager) internal {
        _acl.createPermission(_tokenManager, _voting, _voting.CREATE_VOTES_ROLE(), _voting);
        _acl.createPermission(_voting, _voting, _voting.MODIFY_QUORUM_ROLE(), _voting);
        _acl.createBurnedPermission(_voting, _voting.MODIFY_SUPPORT_ROLE());
    }

    function _cacheToken(MiniMeToken _token, address _owner) internal {
        tokenCache[_owner] = _token;
    }

    function _popTokenCache(address _owner) internal returns (MiniMeToken) {
        require(tokenCache[_owner] != address(0), ERROR_MISSING_TOKEN_CACHE);

        MiniMeToken _token = MiniMeToken(tokenCache[_owner]);
        delete tokenCache[_owner];
        return _token;
    }
}
