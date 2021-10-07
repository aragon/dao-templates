pragma solidity 0.4.24;

import "@aragon/templates-shared/contracts/TokenCache.sol";

import "@tps/apps-address-book/contracts/AddressBook.sol";
import "@tps/apps-allocations/contracts/Allocations.sol";
import "@tps/apps-discussions/contracts/DiscussionApp.sol";
import { DotVoting } from "@tps/apps-dot-voting/contracts/DotVoting.sol";
import "@tps/apps-projects/contracts/Projects.sol";
import "@tps/apps-rewards/contracts/Rewards.sol";

import "./BaseCache.sol";


contract BaseOEApps is BaseCache, TokenCache {
    // /* Hardcoded constant to save gas
    bytes32 constant internal ADDRESS_BOOK_APP_ID = apmNamehash("address-book");              // address-book.aragonpm.eth
    bytes32 constant internal ALLOCATIONS_APP_ID = apmNamehash("allocations");              // allocations.aragonpm.eth;
    bytes32 constant internal DISCUSSIONS_APP_ID = apmNamehash("discussions");            // discussions.aragonpm.eth;
    bytes32 constant internal DOT_VOTING_APP_ID = apmNamehash("dot-voting");            // dot-voting.aragonpm.eth;
    bytes32 constant internal PROJECTS_APP_ID = apmNamehash("projects");              // projects.aragonpm.eth;
    bytes32 constant internal REWARDS_APP_ID = apmNamehash("rewards");              // rewards.aragonpm.eth;
    // */
    // TODO: Move to HatchAPM // Main APM ?
    // bytes32 constant internal ADDRESS_BOOK_APP_ID = 0x32ec8cc9f3136797e0ae30e7bf3740905b0417b81ff6d4a74f6100f9037425de;
    // bytes32 constant internal ALLOCATIONS_APP_ID = 0x370ef8036e8769f293a3d9c1362d0e21bdfa4e0465d2cd9cf196ebd4ba75aa8b;
    // bytes32 constant internal DISCUSSIONS_APP_ID = 0xf8c9b8210902c14e71192ea564edd090c1659cbef1384e362fb508d396d72a38;
    // bytes32 constant internal DOT_VOTING_APP_ID = 0x6bf2b7dbfbb51844d0d6fdc211b014638011261157487ccfef5c2e4fb26b1d7e;
    // bytes32 constant internal PROJECTS_APP_ID = 0xac5c7cc8f4ed07bb3543b5a4152c4f1a045e1be68bd86e2cf6720b680d1d14f3;
    // bytes32 constant internal REWARDS_APP_ID = 0x3ca69801a60916e9222ceb2fa3089b3f66b4e1b3fc49f4a562043d9ec1e5a00b;

    string constant private ERROR_BOUNTIES_NOT_CONTRACT = "BOUNTIES_REGISTRY_NOT_CONTRACT";
    address constant internal ANY_ENTITY = address(-1);
    Bounties internal bountiesRegistry;

    /**
    * @dev Constructor for Open Enterprise Apps DAO
    * @param _deployedSetupContracts Array of [DaoFactory, ENS, MiniMeTokenFactory, AragonID, StandardBounties]
    *       required pre-deployed contracts to set up the organization
    */
    constructor(address[5] _deployedSetupContracts)
        BaseCache(_deployedSetupContracts)
        // internal // TODO: This makes the contract abstract
        public
    {
        _ensureAragonIdIsValid(_deployedSetupContracts[3]);
        _ensureMiniMeFactoryIsValid(_deployedSetupContracts[2]);
        require(isContract(address(_deployedSetupContracts[4])), ERROR_BOUNTIES_NOT_CONTRACT);

        bountiesRegistry = Bounties(_deployedSetupContracts[4]);
    }

    /* ADDRESS-BOOK */

    function _installAddressBookApp(Kernel _dao) internal returns (AddressBook) {
        bytes memory initializeData = abi.encodeWithSelector(AddressBook(0).initialize.selector);
        return AddressBook(_installNonDefaultApp(_dao, ADDRESS_BOOK_APP_ID, initializeData));
    }

    function _createAddressBookPermissions(ACL _acl, AddressBook _addressBook, address _grantee, address _manager) internal {
        _acl.createPermission(_grantee, _addressBook, _addressBook.ADD_ENTRY_ROLE(), _manager);
        _acl.createPermission(_grantee, _addressBook, _addressBook.REMOVE_ENTRY_ROLE(), _manager);
        _acl.createPermission(_grantee, _addressBook, _addressBook.UPDATE_ENTRY_ROLE(), _manager);
    }

    /* ALLOCATIONS */

    function _installAllocationsApp(Kernel _dao, Vault _vault, uint64 _periodDuration) internal returns (Allocations) {
        bytes memory initializeData = abi.encodeWithSelector(Allocations(0).initialize.selector, _vault, _periodDuration);
        return Allocations(_installNonDefaultApp(_dao, ALLOCATIONS_APP_ID, initializeData));
    }

    function _createAllocationsPermissions(
        ACL _acl,
        Allocations _allocations,
        address _createAllocationsGrantee,
        address _createAccountsGrantee,
        address _manager
    )
        internal
    {
        _acl.createPermission(_createAccountsGrantee, _allocations, _allocations.CREATE_ACCOUNT_ROLE(), _manager);
        _acl.createPermission(_createAccountsGrantee, _allocations, _allocations.CHANGE_BUDGETS_ROLE(), _manager);
        _acl.createPermission(_createAllocationsGrantee, _allocations, _allocations.CREATE_ALLOCATION_ROLE(), _manager);
        _acl.createPermission(ANY_ENTITY, _allocations, _allocations.EXECUTE_ALLOCATION_ROLE(), _manager);
        _acl.createPermission(ANY_ENTITY, _allocations, _allocations.EXECUTE_PAYOUT_ROLE(), _manager);
    }

    /**
     * DOT-VOTING
     * @param _dotVotingSettings Array of [minQuorum, candidateSupportPct, voteDuration] to set up the dot voting app of the organization
     **/

    function _installDotVotingApp(Kernel _dao, MiniMeToken _token, uint64[3] memory _dotVotingSettings) internal returns (DotVoting) {
        return _installDotVotingApp(_dao, _token, _dotVotingSettings[0], _dotVotingSettings[1], _dotVotingSettings[2]);
    }

    function _installDotVotingApp(
        Kernel _dao,
        MiniMeToken _token,
        uint64 _quorum,
        uint64 _support,
        uint64 _duration
    )
        internal returns (DotVoting)
    {
        bytes memory initializeData = abi.encodeWithSelector(DotVoting(0).initialize.selector, _token, _quorum, _support, _duration);
        return DotVoting(_installNonDefaultApp(_dao, DOT_VOTING_APP_ID, initializeData));
    }

    function _createDotVotingPermissions(
        ACL _acl,
        DotVoting _dotVoting,
        address _grantee,
        address _manager
    )
        internal
    {
        _acl.createPermission(_grantee, _dotVoting, _dotVoting.ROLE_CREATE_VOTES(), _manager);
        _acl.createPermission(_manager, _dotVoting, _dotVoting.ROLE_ADD_CANDIDATES(), _manager);
    }

    /* DISCUSSIONS */

    function _installDiscussionsApp(Kernel _dao) internal returns (DiscussionApp) {
        return DiscussionApp(_installNonDefaultApp(_dao, DISCUSSIONS_APP_ID));
    }

    function _createDiscussionsPermissions(ACL _acl, DiscussionApp _discussions, address _grantee, address _manager) internal {
        _acl.createPermission(_grantee, _discussions, _discussions.EMPTY_ROLE(), _manager);
    }

    /* PROJECTS */

    function _installProjectsApp(Kernel _dao, Vault _vault) internal returns (Projects) {
        bytes memory initializeData = abi.encodeWithSelector(Projects(0).initialize.selector, bountiesRegistry, _vault);
        return Projects(_installNonDefaultApp(_dao, PROJECTS_APP_ID, initializeData));
    }

    function _createProjectsPermissions(
        ACL _acl,
        Projects _projects,
        address _curator,
        address _grantee,
        address _manager
    )
        internal
    {
        _acl.createPermission(_curator, _projects, _projects.CURATE_ISSUES_ROLE(), _manager);
        _acl.createPermission(_grantee, _projects, _projects.FUND_ISSUES_ROLE(), _manager);
        _acl.createPermission(_grantee, _projects, _projects.REMOVE_ISSUES_ROLE(), _manager);
        _acl.createPermission(_grantee, _projects, _projects.FUND_OPEN_ISSUES_ROLE(), _manager);
        _acl.createPermission(_grantee, _projects, _projects.UPDATE_BOUNTIES_ROLE(), _manager);
        _acl.createPermission(_grantee, _projects, _projects.ADD_REPO_ROLE(), _manager);
        _acl.createPermission(_grantee, _projects, _projects.CHANGE_SETTINGS_ROLE(), _manager);
        _acl.createPermission(_grantee, _projects, _projects.REMOVE_REPO_ROLE(), _manager);
        _acl.createPermission(_grantee, _projects, _projects.REVIEW_APPLICATION_ROLE(), _manager);
        _acl.createPermission(_grantee, _projects, _projects.WORK_REVIEW_ROLE(), _manager);
    }

    /* REWARDS */

    function _installRewardsApp(Kernel _dao, Vault _vault) internal returns (Rewards) {
        bytes memory initializeData = abi.encodeWithSelector(Rewards(0).initialize.selector, _vault);
        return Rewards(_installNonDefaultApp(_dao, REWARDS_APP_ID, initializeData));
    }

    function _createRewardsPermissions(
        ACL _acl,
        Rewards _rewards,
        address _grantee,
        address _manager
    )
        internal
    {
        _acl.createPermission(_grantee, _rewards, _rewards.ADD_REWARD_ROLE(), _manager);
    }

    function _grantVaultPermissions(ACL _acl, Vault _vault, Allocations _allocations, Projects _projects, Rewards _rewards) internal {
        _acl.grantPermission(_allocations, _vault, _vault.TRANSFER_ROLE());
        _acl.grantPermission(_projects, _vault, _vault.TRANSFER_ROLE());
        _acl.grantPermission(_rewards, _vault, _vault.TRANSFER_ROLE());
    }

    /**
     * @dev Overloading from BaseTemplate to remove the grant, that is not needed for Open Enterprise
     */
    function _transferPermissionFromTemplate(ACL _acl, address _app, bytes32 _permission, address _manager) internal {
        _acl.revokePermission(address(this), _app, _permission);
        _acl.setPermissionManager(_manager, _app, _permission);
    }
}
