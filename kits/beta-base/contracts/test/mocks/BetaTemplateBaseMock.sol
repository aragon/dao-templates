pragma solidity 0.4.24;

import "../../BetaKitBase.sol";


contract BetaKitBaseMock is BetaKitBase {
    event CreateToken(address token);
    event PopToken(address token);

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

    function newToken(string name, string symbol) external returns (MiniMeToken token) {
        token = minimeFac.createCloneToken(
            MiniMeToken(address(0)),
            0,
            name,
            0,
            symbol,
            true
        );

        emit CreateToken(token);
    }

    function createDaoExt(
        string _name,
        MiniMeToken _token,
        address[] _holders,
        uint256[] _stakes,
        uint256 _maxTokens
    )
        public
        returns (Voting)
    {
        return createDAO(_name, _token, _holders, _stakes, _maxTokens);
    }

    function cacheTokenExt(MiniMeToken token, address owner) public {
        cacheToken(token, owner);
    }

    function popTokenCacheExt(address owner) public returns (MiniMeToken token) {
        token = popTokenCache(owner);
        emit PopToken(token);
        return token;
    }
}
