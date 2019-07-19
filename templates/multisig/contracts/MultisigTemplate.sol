pragma solidity 0.4.24;

import "@aragon/os/contracts/common/Uint256Helpers.sol";
import "@aragon/templates-shared/contracts/BaseTemplate.sol";


contract MultisigTemplate is BaseTemplate {
    using Uint256Helpers for uint256;

    string constant private ERROR_EMPTY_SIGNERS = "MULTISIG_EMPTY_SIGNERS";
    string constant private ERROR_REQUIRED_SIGNATURES_ZERO = "MULTISIG_REQUIRED_SIGNATURES_ZERO";
    string constant private ERROR_INVALID_REQUIRED_SIGNATURES = "MULTISIG_INVALID_REQUIRED_SIGNATURES";
    string constant private ERROR_MISSING_TOKEN_CACHE = "MULTISIG_MISSING_TOKEN_CACHE";

    mapping (address => address) internal tokenCache;

    constructor(DAOFactory _daoFactory, ENS _ens, MiniMeTokenFactory _miniMeFactory, IFIFSResolvingRegistrar _aragonID)
        BaseTemplate(_daoFactory, _ens, _miniMeFactory, _aragonID)
        public
    {
        // solium-disable-previous-line no-empty-blocks
    }

    function newTokenAndInstance(string tokenName, string tokenSymbol, string id, address[] signers, uint256 requiredSignatures) public {
        newToken(tokenName, tokenSymbol);
        newInstance(id, signers, requiredSignatures);
    }

    function newToken(string name, string symbol) public returns (MiniMeToken) {
        MiniMeToken token = _createToken(name, symbol);
        _cacheToken(token, msg.sender);
        return token;
    }

    function newInstance(string id, address[] signers, uint256 requiredSignatures) public {
        require(signers.length > 0, ERROR_EMPTY_SIGNERS);
        require(requiredSignatures > 0, ERROR_REQUIRED_SIGNATURES_ZERO);
        require(requiredSignatures <= signers.length, ERROR_INVALID_REQUIRED_SIGNATURES);

        // We are subtracting 1 because comparison in Voting app is strict,
        // while Multisig needs to allow equal too. So for instance in 2 out of 4
        // multisig, we would define 50 * 10 ^ 16 - 1 instead of just 50 * 10 ^ 16,
        // so 2 signatures => 2 * 10 ^ 18 / 4 = 50 * 10 ^ 16 > 50 * 10 ^ 16 - 1 would pass
        // We can avoid safemath checks here as it's very unlikely a user will pass in enough
        // signers to cause this to overflow
        uint256 multiSigSupport = requiredSignatures * 10 ** 18 / signers.length - 1;
        MiniMeToken token = _popTokenCache(msg.sender);

        // Create DAO and install apps
        (Kernel dao, ACL acl) = _createDAO();
        Vault vault = _installVaultApp(dao);
        Finance finance = _installFinanceApp(dao, vault, 30 days);
        TokenManager tokenManager = _installTokenManagerApp(dao, token, false, 1);
        Voting voting = _installVotingApp(dao, token, multiSigSupport.toUint64(), multiSigSupport.toUint64(), 1825 days); // ~5 years

        // Mint 1 token per signer
        _createPermissionForTemplate(acl, tokenManager, tokenManager.MINT_ROLE());
        for (uint256 i = 0; i < signers.length; i++) {
            tokenManager.mint(signers[i], 1);
        }
        _removePermissionFromTemplate(acl, tokenManager, tokenManager.MINT_ROLE());

        // Set up permissions
        _createVaultPermissions(acl, vault, finance, voting);
        _createFinancePermissions(acl, finance, voting, voting);
        _createTokenManagerPermissions(acl, tokenManager, voting, voting);
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
