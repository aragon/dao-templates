pragma solidity 0.4.24;

import "@aragon/templates-shared/contracts/BaseTemplate.sol";


contract DemocracyTemplate is BaseTemplate {
    string private constant ERROR_MISSING_TOKEN_CACHE = "DEMOCRACY_MISSING_TOKEN_CACHE";
    string private constant ERROR_INVALID_HOLDERS_STAKES_LEN = "DEMOCRACY_INVALID_HOLDERS_STAKES_LEN";

    mapping (address => address) internal tokenCache;

    constructor(DAOFactory _daoFactory, ENS _ens, MiniMeTokenFactory _miniMeFactory, IFIFSResolvingRegistrar _aragonID)
        BaseTemplate(_daoFactory, _ens, _miniMeFactory, _aragonID)
        public
    {
        // solium-disable-previous-line no-empty-blocks
    }

    function newTokenAndInstance(
        string tokenName,
        string tokenSymbol,
        string id,
        address[] holders,
        uint256[] stakes,
        uint64 supportNeeded,
        uint64 minAcceptanceQuorum,
        uint64 voteDuration
    )
        public
    {
        newToken(tokenName, tokenSymbol);
        newInstance(id, holders, stakes, supportNeeded, minAcceptanceQuorum, voteDuration);
    }

    function newToken(string name, string symbol) public returns (MiniMeToken) {
        MiniMeToken token = _createToken(name, symbol);
        _cacheToken(token, msg.sender);
        return token;
    }

    function newInstance(string id, address[] holders, uint256[] stakes, uint64 supportNeeded, uint64 minAcceptanceQuorum, uint64 voteDuration)
        public
    {
        require(holders.length == stakes.length, ERROR_INVALID_HOLDERS_STAKES_LEN);
        MiniMeToken token = _popTokenCache(msg.sender);

        // Create DAO and install apps
        (Kernel dao, ACL acl) = _createDAO();
        Vault vault = _installVaultApp(dao);
        Finance finance = _installFinanceApp(dao, vault, 30 days);
        TokenManager tokenManager = _installTokenManagerApp(dao, token, true, uint256(-1));
        Voting voting = _installVotingApp(dao, token, supportNeeded, minAcceptanceQuorum, voteDuration);

        // Mint tokens
        _createPermissionForTemplate(acl, tokenManager, tokenManager.MINT_ROLE());
        for (uint256 i = 0; i < holders.length; i++) {
            tokenManager.mint(holders[i], stakes[i]);
        }
        _removePermissionFromTemplate(acl, tokenManager, tokenManager.MINT_ROLE());

        // Set up permissions
        _createVaultPermissions(acl, vault, finance, voting);
        _createFinancePermissions(acl, finance, voting, voting);
        _createTokenManagerPermissions(acl, tokenManager, voting, voting);
        _createEvmScriptsRegistryPermissions(acl, voting, voting);
        _createCustomVotingPermissions(acl, voting, tokenManager);
        _transferPermissionFromTemplate(acl, voting, dao, dao.APP_MANAGER_ROLE());
        _transferPermissionFromTemplate(acl, voting, acl, acl.CREATE_PERMISSIONS_ROLE());

        _registerID(id, dao);
    }

    function _createCustomVotingPermissions(ACL acl, Voting voting, TokenManager tokenManager) internal {
        acl.createPermission(tokenManager, voting, voting.CREATE_VOTES_ROLE(), voting);
        acl.createPermission(voting, voting, voting.MODIFY_QUORUM_ROLE(), voting);
        acl.createBurnedPermission(voting, voting.MODIFY_SUPPORT_ROLE());
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
