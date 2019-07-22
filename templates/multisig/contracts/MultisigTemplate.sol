pragma solidity 0.4.24;

import "@aragon/os/contracts/common/Uint256Helpers.sol";
import "@aragon/templates-shared/contracts/BaseTemplate.sol";


contract MultisigTemplate is BaseTemplate {
    using Uint256Helpers for uint256;

    bool constant private TOKEN_TRANSFERABLE = false;
    uint256 constant private TOKEN_MAX_PER_ACCOUNT = uint256(1);

    string constant private ERROR_EMPTY_SIGNERS = "MULTISIG_EMPTY_SIGNERS";
    string constant private ERROR_REQUIRED_SIGNATURES_ZERO = "MULTISIG_REQUIRED_SIGNATURE_ZERO";
    string constant private ERROR_BAD_REQUIRED_SIGNATURES = "MULTISIG_BAD_REQUIRED_SIGNATURES";
    string constant private ERROR_MISSING_TOKEN_CACHE = "MULTISIG_MISSING_TOKEN_CACHE";

    mapping (address => address) internal tokenCache;

    constructor(DAOFactory _daoFactory, ENS _ens, MiniMeTokenFactory _miniMeFactory, IFIFSResolvingRegistrar _aragonID)
        BaseTemplate(_daoFactory, _ens, _miniMeFactory, _aragonID)
        public
    {
        _ensureAragonIdIsValid(_aragonID);
        _ensureMiniMeFactoryIsValid(_miniMeFactory);
    }

    function newTokenAndInstance(string _tokenName, string _tokenSymbol, string _id, address[] _signer, uint256 _requiredSignatures) public {
        newToken(_tokenName, _tokenSymbol);
        newInstance(_id, _signer, _requiredSignatures);
    }

    function newToken(string _name, string _symbol) public returns (MiniMeToken) {
        MiniMeToken token = _createToken(_name, _symbol);
        _cacheToken(token, msg.sender);
        return token;
    }

    function newInstance(string _id, address[] _signer, uint256 _requiredSignatures) public {
        require(_signer.length > 0, ERROR_EMPTY_SIGNERS);
        require(_requiredSignatures > 0, ERROR_REQUIRED_SIGNATURES_ZERO);
        require(_requiredSignatures <= _signer.length, ERROR_BAD_REQUIRED_SIGNATURES);

        // We are subtracting 1 because comparison in Voting app is strict,
        // while Multisig needs to allow equal too. So for instance in 2 out of 4
        // multisig, we would define 50 * 10 ^ 16 - 1 instead of just 50 * 10 ^ 16,
        // so 2 signatures => 2 * 10 ^ 18 / 4 = 50 * 10 ^ 16 > 50 * 10 ^ 16 - 1 would pass
        // We can avoid safemath checks here as it's very unlikely a user will pass in enough
        // _signer to cause this to overflow
        MiniMeToken token = _popTokenCache(msg.sender);
        uint256 multiSigSupport = _requiredSignatures * 10 ** 18 / _signer.length - 1;

        // Create DAO and install apps
        (Kernel dao, ACL acl) = _createDAO();
        Vault vault = _installVaultApp(dao);
        Finance finance = _installFinanceApp(dao, vault, 30 days);
        TokenManager tokenManager = _installTokenManagerApp(dao, token, TOKEN_TRANSFERABLE, TOKEN_MAX_PER_ACCOUNT);
        Voting voting = _installVotingApp(dao, token, multiSigSupport.toUint64(), multiSigSupport.toUint64(), 1825 days); // ~5 years

        // Mint 1 token per signer
        _createPermissionForTemplate(acl, tokenManager, tokenManager.MINT_ROLE());
        for (uint256 i = 0; i < _signer.length; i++) {
            tokenManager.mint(_signer[i], 1);
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
        _acl.createPermission(_voting, _voting, _voting.MODIFY_SUPPORT_ROLE(), _voting);
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
