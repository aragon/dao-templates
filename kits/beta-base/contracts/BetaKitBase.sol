pragma solidity 0.4.24;

import "@aragon/os/contracts/factory/DAOFactory.sol";
import "@aragon/os/contracts/kernel/Kernel.sol";
import "@aragon/os/contracts/acl/ACL.sol";
import "@aragon/apps-shared-minime/contracts/MiniMeToken.sol";

import "@aragon/id/contracts/IFIFSResolvingRegistrar.sol";

import "@aragon/apps-voting/contracts/Voting.sol";
import "@aragon/apps-vault/contracts/Vault.sol";
import "@aragon/apps-token-manager/contracts/TokenManager.sol";
import "@aragon/apps-finance/contracts/Finance.sol";

import "@aragon/kits-bare/contracts/KitBase.sol";


contract BetaKitBase is KitBase {
    MiniMeTokenFactory public minimeFac;
    IFIFSResolvingRegistrar public aragonID;
    bytes32[4] public appIds;

    mapping (address => address) tokenCache;

    // ensure alphabetic order
    enum Apps { Finance, TokenManager, Vault, Voting }

    event DeployToken(address token, address indexed cacheOwner);
    event DeployInstance(address dao, address indexed token);
    event InstalledApp(address appProxy, bytes32 appId);

    address constant ANY_ENTITY = address(-1);

    constructor(
        DAOFactory _fac,
        ENS _ens,
        MiniMeTokenFactory _minimeFac,
        IFIFSResolvingRegistrar _aragonID,
        bytes32[4] _appIds
    )
        KitBase(_fac, _ens)
        public
    {
        minimeFac = _minimeFac;
        aragonID = _aragonID;
        appIds = _appIds;
    }

    function createDAO(
        string name,
        MiniMeToken token,
        address[] holders,
        uint256[] stakes,
        uint256 _maxTokens
    )
        internal
        returns (Voting)
    {
        Kernel dao = fac.newDAO(this);

        ACL acl = ACL(dao.acl());

        acl.createPermission(this, dao, dao.APP_MANAGER_ROLE(), this);

        Voting voting = Voting(dao.newAppInstance(appIds[uint8(Apps.Voting)], latestVersionAppBase(appIds[uint8(Apps.Voting)])));
        emit InstalledApp(voting, appIds[uint8(Apps.Voting)]);
        Vault vault = Vault(dao.newAppInstance(appIds[uint8(Apps.Vault)], latestVersionAppBase(appIds[uint8(Apps.Vault)])));
        emit InstalledApp(vault, appIds[uint8(Apps.Vault)]);
        Finance finance = Finance(dao.newAppInstance(appIds[uint8(Apps.Finance)], latestVersionAppBase(appIds[uint8(Apps.Finance)])));
        emit InstalledApp(finance, appIds[uint8(Apps.Finance)]);
        TokenManager tokenManager = TokenManager(
            dao.newAppInstance(
                appIds[uint8(Apps.TokenManager)],
                latestVersionAppBase(appIds[uint8(Apps.TokenManager)])
            )
        );
        emit InstalledApp(tokenManager, appIds[uint8(Apps.TokenManager)]);

        token.changeController(tokenManager); // sender has to create tokens

        // permissions
        acl.createPermission(ANY_ENTITY, voting, voting.CREATE_VOTES_ROLE(), voting);
        acl.createPermission(voting, voting, voting.MODIFY_QUORUM_ROLE(), voting);

        acl.createPermission(finance, vault, vault.TRANSFER_ROLE(), voting);
        acl.createPermission(voting, finance, finance.CREATE_PAYMENTS_ROLE(), voting);
        acl.createPermission(voting, finance, finance.EXECUTE_PAYMENTS_ROLE(), voting);
        acl.createPermission(voting, finance, finance.DISABLE_PAYMENTS_ROLE(), voting);
        acl.createPermission(voting, tokenManager, tokenManager.ASSIGN_ROLE(), voting);
        acl.createPermission(voting, tokenManager, tokenManager.REVOKE_VESTINGS_ROLE(), voting);

        require(holders.length == stakes.length);

        acl.createPermission(this, tokenManager, tokenManager.MINT_ROLE(), this);

        tokenManager.initialize(token, _maxTokens > 1, _maxTokens);

        for (uint256 i = 0; i < holders.length; i++) {
            tokenManager.mint(holders[i], stakes[i]);
        }

        // inits
        vault.initialize();
        finance.initialize(vault, uint64(-1) - uint64(now)); // yuge period

        // clean-up
        cleanupPermission(acl, voting, dao, dao.APP_MANAGER_ROLE());
        cleanupPermission(acl, voting, tokenManager, tokenManager.MINT_ROLE());

        registerAragonID(name, dao);
        emit DeployInstance(dao, token);

        // voting is returned so init can happen later
        return voting;
    }

    function cacheToken(MiniMeToken token, address owner) internal {
        tokenCache[owner] = token;
        emit DeployToken(token, owner);
    }

    function popTokenCache(address owner) internal returns (MiniMeToken) {
        require(tokenCache[owner] != address(0));
        MiniMeToken token = MiniMeToken(tokenCache[owner]);
        delete tokenCache[owner];

        return token;
    }

    function registerAragonID(string name, address owner) internal {
        aragonID.register(keccak256(abi.encodePacked(name)), owner);
    }
}
