pragma solidity 0.4.24;

import "./BetaTemplateBase.sol";


contract MultisigTemplate is BetaTemplateBase {

    constructor(
        DAOFactory _fac,
        MiniMeTokenFactory _minimeFac,
        APMRegistry _apm,
        IFIFSResolvingRegistrar _aragonID,
        bytes32[4] _appIds
    )
        BetaTemplateBase(_fac, _minimeFac, _apm, _aragonID, _appIds) public
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
        cacheToken(token, msg.sender);
    }

    function newInstance(string name, address[] signers, uint256 neededSignatures) external {
        require(signers.length > 0);
        require(neededSignatures > 0);

        uint256[] memory stakes = new uint256[](signers.length);

        for (uint256 i = 0; i < signers.length; i++) {
            stakes[i] = 1;
        }

        MiniMeToken token = popTokenCache(msg.sender);
        Voting voting = createDAO(
            name,
            token,
            signers,
            stakes,
            1
        );

        uint256 multisigSupport;
        uint256 neededSignaturesE18 = neededSignatures * 10 ** 18;
        if (neededSignaturesE18 < signers.length) {
            multisigSupport = 0;
        } else {
            multisigSupport = neededSignaturesE18 / signers.length - 1;
        }
        voting.initialize(
            token,
            multisigSupport,
            multisigSupport,
            1825 days // ~5 years
        );
    }
}
