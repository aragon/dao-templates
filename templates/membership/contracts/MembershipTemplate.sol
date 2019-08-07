pragma solidity 0.4.24;

import "@aragon/templates-shared/contracts/BaseTemplate.sol";


contract MembershipTemplate is BaseTemplate {
    string constant private ERROR_MISSING_MEMBERS = "MEMBERSHIP_MISSING_MEMBERS";
    string constant private ERROR_MISSING_TOKEN_CACHE = "MEMBERSHIP_MISSING_TOKEN_CACHE";
    string constant private ERROR_BAD_VOTE_SETTINGS = "MEMBERSHIP_BAD_VOTE_SETTINGS";
    string constant private ERROR_BAD_PAYROLL_SETTINGS = "MEMBERSHIP_BAD_PAYROLL_SETTINGS";

    bool constant private TOKEN_TRANSFERABLE = false;
    uint8 constant private TOKEN_DECIMALS = uint8(0);
    uint256 constant private TOKEN_MAX_PER_ACCOUNT = uint256(1);

    uint64 constant private DEFAULT_FINANCE_PERIOD = uint64(30 days);

    mapping (address => address) internal tokenCache;

    constructor(DAOFactory _daoFactory, ENS _ens, MiniMeTokenFactory _miniMeFactory, IFIFSResolvingRegistrar _aragonID)
        BaseTemplate(_daoFactory, _ens, _miniMeFactory, _aragonID)
        public
    {
        _ensureAragonIdIsValid(_aragonID);
        _ensureMiniMeFactoryIsValid(_miniMeFactory);
    }

    /**
    * @dev Create a new MiniMe token and deploy a Membership DAO. This function does not allow Payroll
    *      to be setup due to gas limits.
    * @param _tokenName String with the name for the token used by share holders in the organization
    * @param _tokenSymbol String with the symbol for the token used by share holders in the organization
    * @param _id String with the name for org, will assign `[id].aragonid.eth`
    * @param _members Array of member addresses (1 token will be minted for each member)
    * @param _votingSettings Array of [supportRequired, minAcceptanceQuorum, voteDuration] to set up the voting app of the organization
    * @param _financePeriod Initial duration for accounting periods, it can be set to zero in order to use the default of 30 days.
    * @param _useAgentAsVault Boolean to tell whether to use an Agent app as a more advanced form of Vault app
    */
    function newTokenAndInstance(
        string _tokenName,
        string _tokenSymbol,
        string _id,
        address[] _members,
        uint64[3] _votingSettings,
        uint64 _financePeriod,
        bool _useAgentAsVault
    )
        external
    {
        newToken(_tokenName, _tokenSymbol);
        newInstance(_id, _members, _votingSettings, _financePeriod, _useAgentAsVault);
    }

    /**
    * @dev Create a new MiniMe token and cache it for the user
    * @param _name String with the name for the token used by share holders in the organization
    * @param _symbol String with the symbol for the token used by share holders in the organization
    */
    function newToken(string _name, string _symbol) public returns (MiniMeToken) {
        MiniMeToken token = _createToken(_name, _symbol, TOKEN_DECIMALS);
        _cacheToken(token, msg.sender);
        return token;
    }

    /**
    * @dev Deploy a Membership DAO using a previously cached MiniMe token
    * @param _id String with the name for org, will assign `[id].aragonid.eth`
    * @param _members Array of member addresses (1 token will be minted for each member)
    * @param _votingSettings Array of [supportRequired, minAcceptanceQuorum, voteDuration] to set up the voting app of the organization
    * @param _financePeriod Initial duration for accounting periods, it can be set to zero in order to use the default of 30 days.
    * @param _useAgentAsVault Boolean to tell whether to use an Agent app as a more advanced form of Vault app
    */
    function newInstance(string _id, address[] _members, uint64[3] _votingSettings, uint64 _financePeriod, bool _useAgentAsVault) public {
        _ensureMembershipSettings(_members, _votingSettings);

        (Kernel dao, ACL acl) = _createDAO();
        (, Voting voting) = _setupApps(dao, acl, _members, _votingSettings, _financePeriod, _useAgentAsVault);
        _transferRootPermissionsFromTemplate(dao, voting);
        _registerID(_id, dao);
    }

    /**
    * @dev Deploy a Membership DAO using a previously cached MiniMe token
    * @param _id String with the name for org, will assign `[id].aragonid.eth`
    * @param _members Array of member addresses (1 token will be minted for each member)
    * @param _votingSettings Array of [supportRequired, minAcceptanceQuorum, voteDuration] to set up the voting app of the organization
    * @param _financePeriod Initial duration for accounting periods, it can be set to zero in order to use the default of 30 days.
    * @param _useAgentAsVault Boolean to tell whether to use an Agent app as a more advanced form of Vault app
    * @param _payrollSettings Array of [address denominationToken , IFeed priceFeed, uint64 rateExpiryTime, address employeeManager]
             for the payroll app. The `employeeManager` can be set to `0x0` in order to use the voting app as the employee manager.
    */
    function newInstance(string _id, address[] _members, uint64[3] _votingSettings, uint64 _financePeriod, bool _useAgentAsVault, uint256[4] _payrollSettings) public {
        _ensureMembershipSettings(_members, _votingSettings, _payrollSettings);

        (Kernel dao, ACL acl) = _createDAO();
        (Finance finance, Voting voting) = _setupApps(dao, acl, _members, _votingSettings, _financePeriod, _useAgentAsVault);
        _setupPayrollApp(dao, acl, finance, voting, _payrollSettings);
        _transferRootPermissionsFromTemplate(dao, voting);
        _registerID(_id, dao);
    }

    function _setupApps(Kernel _dao, ACL _acl, address[] _members, uint64[3] _votingSettings, uint64 _financePeriod, bool _useAgentAsVault) internal returns (Finance, Voting) {
        MiniMeToken token = _popTokenCache(msg.sender);
        Vault agentOrVault = _useAgentAsVault ? _installDefaultAgentApp(_dao) : _installVaultApp(_dao);
        Finance finance = _installFinanceApp(_dao, agentOrVault, _financePeriod == 0 ? DEFAULT_FINANCE_PERIOD : _financePeriod);
        TokenManager tokenManager = _installTokenManagerApp(_dao, token, TOKEN_TRANSFERABLE, TOKEN_MAX_PER_ACCOUNT);
        Voting voting = _installVotingApp(_dao, token, _votingSettings[0], _votingSettings[1], _votingSettings[2]);

        _mintTokens(_acl, tokenManager, _members, 1);
        _setupPermissions(_acl, agentOrVault, voting, finance, tokenManager, _useAgentAsVault);

        return (finance, voting);
    }

    function _setupPayrollApp(Kernel _dao, ACL _acl, Finance _finance, Voting _voting, uint256[4] _payrollSettings) internal {
        (address denominationToken, IFeed priceFeed, uint64 rateExpiryTime, address employeeManager) = _unwrapPayrollSettings(_payrollSettings);
        address manager = employeeManager == address(0) ? _voting : employeeManager;

        Payroll payroll = _installPayrollApp(_dao, _finance, denominationToken, priceFeed, rateExpiryTime);
        _createPayrollPermissions(_acl, payroll, manager, _voting, _voting);
    }

    function _setupPermissions(ACL _acl, Vault _agentOrVault, Voting _voting, Finance _finance, TokenManager _tokenManager, bool _useAgentAsVault) internal {
        if (_useAgentAsVault) {
            _createAgentPermissions(_acl, Agent(_agentOrVault), _voting, _voting);
        }
        _createVaultPermissions(_acl, _agentOrVault, _finance, _voting);
        _createFinancePermissions(_acl, _finance, _voting, _voting);
        _createEvmScriptsRegistryPermissions(_acl, _voting, _voting);
        _createCustomVotingPermissions(_acl, _voting, _tokenManager);
        _createCustomTokenManagerPermissions(_acl, _tokenManager, _voting);
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

    function _ensureMembershipSettings(address[] _members, uint64[3] _votingSettings, uint256[4] _payrollSettings) private pure {
        _ensureMembershipSettings(_members, _votingSettings);
        require(_payrollSettings.length == 4, ERROR_BAD_PAYROLL_SETTINGS);
    }

    function _ensureMembershipSettings(address[] _members, uint64[3] _votingSettings) private pure {
        require(_members.length > 0, ERROR_MISSING_MEMBERS);
        require(_votingSettings.length == 3, ERROR_BAD_VOTE_SETTINGS);
    }
}
