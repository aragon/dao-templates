pragma solidity 0.4.24;

import "./BetaTemplateBase.sol";


contract DemocracyTemplate is BetaTemplateBase {
    constructor(
        DAOFactory _fac,
        ENS _ens,
        MiniMeTokenFactory _minimeFac,
        IFIFSResolvingRegistrar _aragonID,
        bytes32[4] _appIds
    )
        BetaTemplateBase(_fac, _ens, _minimeFac, _aragonID, _appIds)
        public
    {}

    function newToken(string name, string symbol) external returns (MiniMeToken token) {
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
        uint256 supportNeeded,
        uint256 minAcceptanceQuorum,
        uint64 voteDuration
    )
        external
    {
        MiniMeToken token = popTokenCache(msg.sender);
        Voting voting = createDAO(
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
    }
}
