pragma solidity 0.4.24;

import "@aragon/kits-beta/contracts/BetaKitBase.sol";


contract MultisigKit is BetaKitBase {

    constructor(
        DAOFactory _fac,
        ENS _ens,
        MiniMeTokenFactory _minimeFac,
        IFIFSResolvingRegistrar _aragonID,
        bytes32[4] _appIds
    )
        BetaKitBase(_fac, _ens, _minimeFac, _aragonID, _appIds) public
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
        uint256 neededSignaturesE18 = neededSignatures * 10 ** 18;
        require(neededSignaturesE18 >= signers.length);

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

        // We are subtracting 1 because comparison in Voting app is strict,
        // while Multisig needs to allow equal too. So for instance in 2 out of 4
        // multisig, we would define 50 * 10 ^ 16 - 1 instead of just 50 * 10 ^ 16,
        // so 2 signatures => 2 * 10 ^ 18 / 4 = 50 * 10 ^ 16 > 50 * 10 ^ 16 - 1 would pas
        uint256 multisigSupport = neededSignaturesE18 / signers.length - 1;
        voting.initialize(
            token,
            multisigSupport,
            multisigSupport,
            1825 days // ~5 years
        );

        // support modification permission
        ACL acl = ACL(Kernel(voting.kernel()).acl());
        acl.createPermission(voting, voting, voting.MODIFY_SUPPORT_ROLE(), voting);

        cleanupPermission(acl, voting, acl, acl.CREATE_PERMISSIONS_ROLE());
    }
}
