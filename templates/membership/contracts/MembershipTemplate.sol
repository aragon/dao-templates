pragma solidity 0.4.24;

import "@aragon/templates-shared/contracts/BaseTemplate.sol";
import "@aragon/os/contracts/common/Uint256Helpers.sol";


contract MembershipTemplate is BaseTemplate {
    using Uint256Helpers for uint256;

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

    function newTokenAndInstance(
        string _tokenName,
        string _tokenSymbol,
        string _id,
        address[] _members,
        uint64[3] _votingSettings, /* supportRequired, minAcceptanceQuorum, voteDuration */
        uint64 _financePeriod,
        bool _useAgentAsVault
    )
        external
    {
        newToken(_tokenName, _tokenSymbol);
        newInstance(_id, _members, _votingSettings, _financePeriod, _useAgentAsVault);
    }

    function newToken(string _name, string _symbol) public returns (MiniMeToken) {
        MiniMeToken token = _createToken(_name, _symbol, TOKEN_DECIMALS);
        _cacheToken(token, msg.sender);
        return token;
    }

    function newInstance(string _id, address[] _members, uint64[3] _votingSettings, uint64 _financePeriod, bool _useAgentAsVault) public {
        _verifyOrgParameters(_members, _votingSettings);
        (Kernel dao, ACL acl) = _createDAO();
        (, Voting voting) = _setupApps(dao, acl, _members, _votingSettings, _financePeriod, _useAgentAsVault);
        _transferRootPermissionsFromTemplate(dao, voting);
        _registerID(_id, dao);
    }

    function newInstance(
        string _id,
        address[] _members,
        uint64[3] _votingSettings,
        uint64 _financePeriod,
        bool _useAgentAsVault,
        uint256[4] _payrollSettings /* address denominationToken , IFeed priceFeed, uint64 rateExpiryTime, address employeeManager (set to voting if 0x0) */
    )
        public
    {
        _verifyOrgParameters(_members, _votingSettings);
        require(_payrollSettings.length == 4, ERROR_BAD_PAYROLL_SETTINGS);

        (Kernel dao, ACL acl) = _createDAO();
        (Finance finance, Voting voting) = _setupApps(dao, acl, _members, _votingSettings, _financePeriod, _useAgentAsVault);
        _setupPayrollApp(dao, acl, _payrollSettings, finance, voting);
        _transferRootPermissionsFromTemplate(dao, voting);
        _registerID(_id, dao);
    }

    function _verifyOrgParameters(address[] _members, uint64[3] _votingSettings) internal {
        require(_members.length > 0, ERROR_MISSING_MEMBERS);
        require(_votingSettings.length == 3, ERROR_BAD_VOTE_SETTINGS);
    }

    function _setupApps(Kernel _dao, ACL _acl, address[] _members, uint64[3] _votingSettings, uint64 _financePeriod, bool _useAgentAsVault) internal returns(Finance, Voting) {
        MiniMeToken token = _popTokenCache(msg.sender);
        Vault agentOrVault = _useAgentAsVault ? _installDefaultAgentApp(_dao) : _installVaultApp(_dao);
        Finance finance = _installFinanceApp(_dao, agentOrVault, _financePeriod == 0 ? DEFAULT_FINANCE_PERIOD : _financePeriod);
        TokenManager tokenManager = _installTokenManagerApp(_dao, token, TOKEN_TRANSFERABLE, TOKEN_MAX_PER_ACCOUNT);
        Voting voting = _installVotingApp(_dao, token, _votingSettings[0], _votingSettings[1], _votingSettings[2]);

        _mintTokens(_acl, tokenManager, _members, 1);
        _setupPermissions(_dao, _acl, agentOrVault, voting, finance, tokenManager, _useAgentAsVault);

        return (finance, voting);
    }

    function _setupPayrollApp(Kernel _dao, ACL _acl, uint256[4] _payrollSettings, Finance _finance, Voting _voting) internal {
        address denominationToken = _toAddress(_payrollSettings[0]);
        IFeed priceFeed = IFeed(_toAddress(_payrollSettings[1]));
        uint64 rateExpiryTime = _payrollSettings[2].toUint64();
        address employeeManager = _toAddress(_payrollSettings[3]);
        if (employeeManager == 0x0) {
            employeeManager = _voting;
        }

        Payroll payroll = _installPayrollApp(_dao, _finance, denominationToken, priceFeed, rateExpiryTime);
        _createPayrollPermissions(_acl, payroll, employeeManager, _voting, _voting);
    }

    function _setupPermissions(Kernel _dao, ACL _acl, Vault _agentOrVault, Voting _voting, Finance _finance, TokenManager _tokenManager, bool _useAgentAsVault) internal {
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
}
