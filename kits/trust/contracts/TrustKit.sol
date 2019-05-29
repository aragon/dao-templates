pragma solidity 0.4.24;

import "@aragon/os/contracts/acl/ACL.sol";
import "@aragon/os/contracts/kernel/Kernel.sol";
import "@aragon/os/contracts/factory/DAOFactory.sol";
import "@aragon/os/contracts/common/IsContract.sol";
import "@aragon/os/contracts/lib/math/SafeMath.sol";
import "@aragon/kits-base/contracts/KitBase.sol";
import "@aragon/apps-agent/contracts/Agent.sol";
import "@aragon/apps-vault/contracts/Vault.sol";
import "@aragon/apps-voting/contracts/Voting.sol";
import "@aragon/apps-finance/contracts/Finance.sol";
import "@aragon/apps-token-manager/contracts/TokenManager.sol";
import "@aragon/apps-shared-minime/contracts/MiniMeToken.sol";
import "@aragon/id/contracts/IFIFSResolvingRegistrar.sol";
import "multisig-wallet-gnosis/contracts/MultiSigWallet.sol";


contract TrustKit is KitBase, IsContract {
    using SafeMath for uint256;

    string constant private ERROR_BAD_HEIRS_LENGTH = "TRUST_BAD_HEIRS_LENGTH";
    string constant private ERROR_BAD_APP_IDS_LENGTH = "TRUST_BAD_APP_IDS_LENGTH";
    string constant private ERROR_BAD_MULTI_SIG_KEYS_LENGTH = "TRUST_BAD_MULTI_SIG_KEYS_LENGTH";
    string constant private ERROR_BAD_BENEFICIARY_KEYS_LENGTH = "TRUST_BAD_BENEFICIARY_KEY_LENGTH";
    string constant private ERROR_INVALID_HEIRS_STAKE = "TRUST_INVALID_HEIRS_STAKE";
    string constant private ERROR_REGISTRY_FACTORY_IS_NOT_CONTRACT = "TRUST_REGISTRY_FACT_NOT_CONTRACT";
    string constant private ERROR_MISSING_CACHE_TOKENS_FOR_SENDER = "TRUST_MISSING_SENDER_CACHE_TOKEN";

    uint256 constant private ONE_PCT = uint64(1e16);                            // 1%
    uint256 constant private ACCOUNT_TOKENS_CAP = uint256(-1);                  // max number of tokens an account can have
    uint256 constant private BENEFICIARY_KEYS_AMOUNT = 2;                       // hold + cold keys
    uint256 constant private MULTI_SIG_EXTERNAL_KEYS_AMOUNT = 2;                // 2 external keys for the multis sig wallet
    uint256 constant private MULTI_SIG_REQUIRED_CONFIRMATIONS = 2;              // 2 out of 3 (keys + dao)

    string constant private HOLD_TOKEN_NAME = "Beneficiaries Token";
    string constant private HOLD_TOKEN_SYMBOL = "HOLD";
    uint8 constant private HOLD_TOKEN_DECIMALS = uint8(18);
    uint64 constant private HOLD_VOTE_DURATION = uint64(7 days);                // 1 week
    uint64 constant private HOLD_SUPPORT_REQUIRED = uint64(100 * ONE_PCT - 1);  // 99.9999999999999999%
    uint64 constant private HOLD_MIN_ACCEPTANCE_QUORUM = uint64(0);             // 0%

    string constant private HEIRS_TOKEN_NAME = "Heirs Token";
    string constant private HEIRS_TOKEN_SYMBOL = "HEIRS";
    uint8 constant private HEIRS_TOKEN_DECIMALS = uint8(18);
    uint64 constant private HEIRS_VOTE_DURATION = uint64(365 days);             // 1 year
    uint64 constant private HEIRS_SUPPORT_REQUIRED = uint64(66 * ONE_PCT);      // 66%
    uint64 constant private HEIRS_MIN_ACCEPTANCE_QUORUM = uint64(0);            // 0%

    // ensure alphabetic order
    enum Apps { Agent, Finance, TokenManager, Vault, Voting }

    struct TokenCache {
        address holdToken;
        address heirsToken;
    }

    // storage state
    bytes32[5] public appIds;
    MiniMeTokenFactory public miniMeFactory;
    IFIFSResolvingRegistrar public aragonID;
    mapping (address => TokenCache) internal tokensCache;

    event DeployTrustEntity(address dao, address multiSig);

    constructor(
        DAOFactory _daoFactory,
        ENS _ens,
        MiniMeTokenFactory _miniMeFactory,
        IFIFSResolvingRegistrar _aragonID,
        bytes32[5] _appIds
    )
        KitBase(_daoFactory, _ens)
        public
    {
        require(_appIds.length == 5, ERROR_BAD_APP_IDS_LENGTH);
        require(isContract(address(_daoFactory.regFactory())), ERROR_REGISTRY_FACTORY_IS_NOT_CONTRACT);

        miniMeFactory = _miniMeFactory;
        aragonID = _aragonID;
        appIds = _appIds;
    }

    function newTokens() public {
        (MiniMeToken holdToken, MiniMeToken heirsToken) = _createTokens();
        _cacheTokens(holdToken, heirsToken, msg.sender);
    }

    function newInstance(
        string id,
        address[] beneficiaryKeys,
        address[] multiSigKeys,
        address[] heirs,
        uint256[] heirsStake
    )
        public
        returns (Kernel, MultiSigWallet)
    {
        (Kernel dao, MultiSigWallet multiSigWallet) = _createDAO(beneficiaryKeys, multiSigKeys, heirs, heirsStake);
        _registerAragonID(id, address(dao));
        emit DeployTrustEntity(address(dao), address(multiSigWallet));
        return (dao, multiSigWallet);
    }

    function _createDAO(address[] beneficiaryKeys, address[] multiSigKeys, address[] heirs, uint256[] heirsStake)
        internal
        returns (Kernel, MultiSigWallet)
    {
        require(heirs.length == heirsStake.length, ERROR_BAD_HEIRS_LENGTH);
        require(beneficiaryKeys.length == BENEFICIARY_KEYS_AMOUNT, ERROR_BAD_BENEFICIARY_KEYS_LENGTH);
        uint256 blockedHeirsSupply = _calculateBlockedHeirsSupply(heirsStake);

        Kernel dao = fac.newDAO(address(this));
        MultiSigWallet multiSig = _createMultiSig(dao, multiSigKeys);
        ACL acl = ACL(dao.acl());

        acl.createPermission(address(this), dao, dao.APP_MANAGER_ROLE(), address(this));
        (Voting holdVoting, Voting heirsVoting, TokenManager holdTokenManager, TokenManager heirsTokenManager) = _setupApps(dao, acl, multiSig);
        _mintHoldTokens(holdTokenManager, beneficiaryKeys);
        _mintHeirsTokens(heirsTokenManager, heirs, heirsStake, blockedHeirsSupply);
        _cleanupPermissions(dao, acl, multiSig, holdVoting, heirsVoting, holdTokenManager, heirsTokenManager);

        return (dao, multiSig);
    }

    function _createMultiSig(Kernel dao, address[] multiSigKeys) internal returns (MultiSigWallet) {
        address[] memory multiSigOwners = new address[](3);
        multiSigOwners[0] = multiSigKeys[0];
        multiSigOwners[1] = multiSigKeys[1];
        multiSigOwners[2] = address(dao);
        return new MultiSigWallet(multiSigOwners, MULTI_SIG_REQUIRED_CONFIRMATIONS);
    }

    function _setupApps(Kernel dao, ACL acl, MultiSigWallet multiSig)
        internal
        returns (Voting holdVoting, Voting heirsVoting, TokenManager holdTokenManager, TokenManager heirsTokenManager)
    {
        (holdVoting, heirsVoting, holdTokenManager, heirsTokenManager) = _setupTokenApps(dao, acl, multiSig);
        _setupFinanceApps(dao, acl, holdVoting);
        _setupAgentApp(dao, acl, holdVoting, heirsVoting);
    }

    function _setupTokenApps(Kernel dao, ACL acl, MultiSigWallet multiSig)
        internal
        returns (Voting holdVoting, Voting heirsVoting, TokenManager holdTokenManager, TokenManager heirsTokenManager)
    {
        (MiniMeToken holdToken, MiniMeToken heirsToken) = _popTokensCache(msg.sender);
        (holdVoting, heirsVoting) = _createVotingApps(dao);
        (holdTokenManager, heirsTokenManager) = _createTokenManagerApps(dao);

        holdToken.changeController(holdTokenManager);
        heirsToken.changeController(heirsTokenManager);

        _createVotingPermissions(acl, holdTokenManager, holdVoting);
        _createVotingPermissions(acl, heirsTokenManager, heirsVoting);
        _createTokenManagerPermissions(acl, multiSig, holdTokenManager, holdVoting);
        _createTokenManagerPermissions(acl, multiSig, heirsTokenManager, heirsVoting);
        _createEVMRegistryPermissions(acl, holdVoting);

        holdTokenManager.initialize(holdToken, true, ACCOUNT_TOKENS_CAP);
        heirsTokenManager.initialize(heirsToken, true, ACCOUNT_TOKENS_CAP);
        holdVoting.initialize(holdToken, HOLD_SUPPORT_REQUIRED, HOLD_MIN_ACCEPTANCE_QUORUM, HOLD_VOTE_DURATION);
        heirsVoting.initialize(heirsToken, HEIRS_SUPPORT_REQUIRED, HEIRS_MIN_ACCEPTANCE_QUORUM, HEIRS_VOTE_DURATION);
    }

    function _setupFinanceApps(Kernel dao, ACL acl, Voting holdVoting) internal {
        Vault vault = _createVaultApp(dao);
        Finance finance = _createFinanceApp(dao);
        _createFinancePermissions(acl, holdVoting, finance, vault);
        vault.initialize();
        finance.initialize(vault, 30 days);
    }

    function _setupAgentApp(Kernel dao, ACL acl, Voting holdVoting, Voting heirsVoting) internal {
        Agent agent = _createAgentApp(dao);
        _createAgentPermission(acl, holdVoting, heirsVoting, agent, agent.EXECUTE_ROLE());
        _createAgentPermission(acl, holdVoting, heirsVoting, agent, agent.RUN_SCRIPT_ROLE());
        agent.initialize();
    }

    function _createTokens() internal returns (MiniMeToken holdToken, MiniMeToken heirsToken) {
        MiniMeToken parentToken = MiniMeToken(address(0));
        holdToken = miniMeFactory.createCloneToken(parentToken, 0, HOLD_TOKEN_NAME, HOLD_TOKEN_DECIMALS, HOLD_TOKEN_SYMBOL, true);
        heirsToken = miniMeFactory.createCloneToken(parentToken, 0, HEIRS_TOKEN_NAME, HEIRS_TOKEN_DECIMALS, HEIRS_TOKEN_SYMBOL, true);
    }

    function _createVotingApps(Kernel dao) internal returns (Voting holdVoting, Voting heirsVoting) {
        bytes32 votingAppId = appIds[uint8(Apps.Voting)];
        address latestVotingAddress = latestVersionAppBase(votingAppId);
        holdVoting = Voting(dao.newAppInstance(votingAppId, latestVotingAddress));
        heirsVoting = Voting(dao.newAppInstance(votingAppId, latestVotingAddress));
    }

    function _createTokenManagerApps(Kernel dao) internal returns (TokenManager holdTokenManager, TokenManager heirsTokenManager) {
        bytes32 tokenManagerAppId = appIds[uint8(Apps.TokenManager)];
        address latestTokenManagerAddress = latestVersionAppBase(tokenManagerAppId);
        holdTokenManager = TokenManager(dao.newAppInstance(tokenManagerAppId, latestTokenManagerAddress));
        heirsTokenManager = TokenManager(dao.newAppInstance(tokenManagerAppId, latestTokenManagerAddress));
    }

    function _createVaultApp(Kernel dao) internal returns (Vault) {
        bytes32 vaultAppId = appIds[uint8(Apps.Vault)];
        address latestVaultAddress = latestVersionAppBase(vaultAppId);
        return Vault(dao.newAppInstance(vaultAppId, latestVaultAddress, new bytes(0), true));
    }

    function _createFinanceApp(Kernel dao) internal returns (Finance) {
        bytes32 financeAppId = appIds[uint8(Apps.Finance)];
        address latestFinanceAddress = latestVersionAppBase(financeAppId);
        return Finance(dao.newAppInstance(financeAppId, latestFinanceAddress));
    }

    function _createAgentApp(Kernel dao) internal returns (Agent) {
        bytes32 agentAppId = appIds[uint8(Apps.Agent)];
        address latestAgentAddress = latestVersionAppBase(agentAppId);
        return Agent(dao.newAppInstance(agentAppId, latestAgentAddress));
    }

    function _createVotingPermissions(ACL acl, TokenManager tokenManager, Voting voting) internal {
        acl.createPermission(tokenManager, voting, voting.CREATE_VOTES_ROLE(), voting);
        acl.createPermission(voting, voting, voting.MODIFY_QUORUM_ROLE(), voting);
        acl.createPermission(voting, voting, voting.MODIFY_SUPPORT_ROLE(), voting);
    }

    function _createTokenManagerPermissions(ACL acl, MultiSigWallet multiSig, TokenManager tokenManager, Voting voting) internal {
        acl.createPermission(address(this), tokenManager, tokenManager.MINT_ROLE(), address(this));
        acl.createPermission(multiSig, tokenManager, tokenManager.BURN_ROLE(), multiSig);
        acl.createPermission(voting, tokenManager, tokenManager.ASSIGN_ROLE(), voting);
        acl.createPermission(voting, tokenManager, tokenManager.REVOKE_VESTINGS_ROLE(), voting);
    }

    function _createEVMRegistryPermissions(ACL acl, Voting holdVoting) internal {
        EVMScriptRegistry evmScriptsRegistry = EVMScriptRegistry(acl.getEVMScriptRegistry());
        bytes32 addExecutorRole = evmScriptsRegistry.REGISTRY_ADD_EXECUTOR_ROLE();
        acl.createPermission(holdVoting, evmScriptsRegistry, addExecutorRole, holdVoting);
        bytes32 managerRole = evmScriptsRegistry.REGISTRY_MANAGER_ROLE();
        acl.createPermission(holdVoting, evmScriptsRegistry, managerRole, holdVoting);
    }

    function _createFinancePermissions(ACL acl, Voting holdVoting, Finance finance, Vault vault) internal {
        acl.createPermission(finance, vault, vault.TRANSFER_ROLE(), holdVoting);
        acl.createPermission(holdVoting, finance, finance.CREATE_PAYMENTS_ROLE(), holdVoting);
        acl.createPermission(holdVoting, finance, finance.EXECUTE_PAYMENTS_ROLE(), holdVoting);
        acl.createPermission(holdVoting, finance, finance.MANAGE_PAYMENTS_ROLE(), holdVoting);
    }

    function _createAgentPermission(ACL acl, Voting holdVoting, Voting heirsVoting, Agent agent, bytes32 permission) internal {
        acl.createPermission(holdVoting, agent, permission, address(this));
        acl.grantPermission(heirsVoting, agent, permission);
        acl.revokePermission(address(this), agent, permission);
        acl.setPermissionManager(holdVoting, agent, permission);
    }

    function _mintHoldTokens(TokenManager holdTokenManager, address[] beneficiaryKeys) internal {
        holdTokenManager.mint(beneficiaryKeys[0], 1e18);
        holdTokenManager.mint(beneficiaryKeys[1], 1e18);
    }

    function _mintHeirsTokens(TokenManager heirsTokenManager, address[] heirs, uint256[] heirsStake, uint256 blockedHeirsSupply) internal {
        heirsTokenManager.mint(address(0), blockedHeirsSupply);
        for (uint256 i = 0; i < heirs.length; i++) {
            heirsTokenManager.mint(heirs[i], heirsStake[i]);
        }
    }

    function _cleanupPermissions(
        Kernel dao,
        ACL acl,
        MultiSigWallet multiSig,
        Voting holdVoting,
        Voting heirsVoting,
        TokenManager holdTokenManager,
        TokenManager heirsTokenManager
    )
        internal
    {
        cleanupPermission(acl, holdVoting, dao, dao.APP_MANAGER_ROLE());
        cleanupPermission(acl, holdVoting, acl, acl.CREATE_PERMISSIONS_ROLE());
        cleanupPermission(acl, multiSig, holdTokenManager, holdTokenManager.MINT_ROLE());
        cleanupPermission(acl, multiSig, heirsTokenManager, heirsTokenManager.MINT_ROLE());
    }

    function _cacheTokens(MiniMeToken holdToken, MiniMeToken heirsToken, address owner) internal {
        tokensCache[owner] = TokenCache({ holdToken: holdToken, heirsToken: heirsToken });
    }

    function _popTokensCache(address owner) internal returns (MiniMeToken holdToken, MiniMeToken heirsToken) {
        TokenCache storage cache = tokensCache[owner];
        require(cache.holdToken != address(0) && cache.heirsToken != address(0), ERROR_MISSING_CACHE_TOKENS_FOR_SENDER);

        holdToken = MiniMeToken(cache.holdToken);
        heirsToken = MiniMeToken(cache.heirsToken);
        delete tokensCache[owner];
    }

    function _registerAragonID(string name, address owner) internal {
        aragonID.register(keccak256(abi.encodePacked(name)), owner);
    }

    function _calculateBlockedHeirsSupply(uint256[] heirsStake) internal view returns (uint256) {
        uint256 totalHeirsSupply = 0;
        for (uint256 i = 0; i < heirsStake.length; i++) {
            totalHeirsSupply = totalHeirsSupply.add(heirsStake[i]);
        }
        uint256 support = HEIRS_SUPPORT_REQUIRED / ONE_PCT;
        require(totalHeirsSupply.mul(100) % support == 0, ERROR_INVALID_HEIRS_STAKE);
        uint256 totalSupply = totalHeirsSupply.mul(100).div(support);
        uint256 blockedSupply = totalSupply.sub(totalHeirsSupply);
        return blockedSupply;
    }
}
