pragma solidity 0.4.24;

import "@aragon/kits-beta-base/contracts/BetaKitBase.sol";


contract DemocracyKit is BetaKitBase {
    constructor(
        DAOFactory _fac,
        ENS _ens,
        MiniMeTokenFactory _minimeFac,
        IFIFSResolvingRegistrar _aragonID,
        bytes32[4] _appIds
    )
        BetaKitBase(_fac, _ens, _minimeFac, _aragonID, _appIds)
        public
    {}

    function newDemoInstance(string name) external {
        address[] memory holders = new address[](1);
        holders[0] = msg.sender;
        uint256[] memory balances = new uint256[](1);
        balances[0] = 10 ** 18; // 1 token
        newTokenAndInstance(
            name,
            name,
            holders,
            balances,
            50 * 10 ** 16, // 50% support
            20 * 10 ** 16, // 20% quorum
            1 days
        );
    }

    function newTokenAndInstance(
        string name,
        string symbol,
        address[] holders,
        uint256[] tokens,
        uint64 supportNeeded,
        uint64 minAcceptanceQuorum,
        uint64 voteDuration
    ) public
    {
        newToken(name, symbol);
        newInstance(
            name,
            holders,
            tokens,
            supportNeeded,
            minAcceptanceQuorum,
            voteDuration
        );
    }

    function newToken(string name, string symbol) public returns (MiniMeToken token) {
        token = minimeFac.createCloneToken(
            MiniMeToken(address(0)),
            0,
            name,
            18,
            symbol,
            true
        );
        cacheToken(token, msg.sender);
    }

    function newInstance(
        string name,
        address[] holders,
        uint256[] tokens,
        uint64 supportNeeded,
        uint64 minAcceptanceQuorum,
        uint64 voteDuration
    )
        public
    {
        MiniMeToken token = popTokenCache(msg.sender);
        Kernel dao;
        ACL acl;
        Voting voting;
        (dao, acl, , , , voting) = createDAO(
            name,
            token,
            holders,
            tokens,
            uint256(-1)
        );

        voting.initialize(
            token,
            supportNeeded,
            minAcceptanceQuorum,
            voteDuration
        );

        // create vote permission
        acl.createPermission(acl.ANY_ENTITY(), voting, voting.CREATE_VOTES_ROLE(), voting);

        // burn support modification permission
        acl.createBurnedPermission(voting, voting.MODIFY_SUPPORT_ROLE());

        cleanupPermission(acl, voting, acl, acl.CREATE_PERMISSIONS_ROLE());
    }
}
