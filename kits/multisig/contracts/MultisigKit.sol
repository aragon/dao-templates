pragma solidity 0.4.24;

import "@aragon/os/contracts/common/Uint256Helpers.sol";
import "@aragon/kits-beta-base/contracts/BetaKitBase.sol";


contract MultisigKit is BetaKitBase {
    using Uint256Helpers for uint256;

    constructor(
        DAOFactory _fac,
        ENS _ens,
        MiniMeTokenFactory _minimeFac,
        IFIFSResolvingRegistrar _aragonID,
        bytes32[4] _appIds
    )
        BetaKitBase(_fac, _ens, _minimeFac, _aragonID, _appIds) public
    {
        // solium-disable-previous-line no-empty-blocks
    }

    function newTokenAndInstance(
        string tokenName,
        string tokenSymbol,
        string aragonId,
        address[] signers,
        uint256 neededSignatures
    ) public
    {
        newToken(tokenName, tokenSymbol);
        newInstance(aragonId, signers, neededSignatures);
    }

    function newToken(string tokenName, string tokenSymbol) public returns (MiniMeToken token) {
        token = minimeFac.createCloneToken(
            MiniMeToken(address(0)),
            0,
            tokenName,
            0,
            tokenSymbol,
            true
        );
        cacheToken(token, msg.sender);
    }

    function newInstance(string aragonId, address[] signers, uint256 neededSignatures) public {
        require(signers.length > 0 && neededSignatures > 0);
        require(neededSignatures <= signers.length);

        uint256[] memory stakes = new uint256[](signers.length);

        for (uint256 i = 0; i < signers.length; i++) {
            stakes[i] = 1;
        }

        MiniMeToken token = popTokenCache(msg.sender);
        Kernel dao;
        ACL acl;
        TokenManager tokenManager;
        Voting voting;
        (dao, acl, , tokenManager, , voting) = createDAO(
            aragonId,
            token,
            signers,
            stakes,
            1
        );

        // We are subtracting 1 because comparison in Voting app is strict,
        // while Multisig needs to allow equal too. So for instance in 2 out of 4
        // multisig, we would define 50 * 10 ^ 16 - 1 instead of just 50 * 10 ^ 16,
        // so 2 signatures => 2 * 10 ^ 18 / 4 = 50 * 10 ^ 16 > 50 * 10 ^ 16 - 1 would pass
        // We can avoid safemath checks here as it's very unlikely a user will pass in enough
        // signers to cause this to overflow
        uint256 multisigSupport = neededSignatures * 10 ** 18 / signers.length - 1;
        voting.initialize(
            token,
            multisigSupport.toUint64(),
            multisigSupport.toUint64(),
            1825 days // ~5 years
        );

        // Include support modification permission to handle changes to the multisig's size
        acl.createPermission(voting, voting, voting.MODIFY_SUPPORT_ROLE(), voting);

        cleanupPermission(acl, voting, acl, acl.CREATE_PERMISSIONS_ROLE());
    }
}
