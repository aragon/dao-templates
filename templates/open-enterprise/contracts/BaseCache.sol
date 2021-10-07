pragma solidity 0.4.24;

import "@aragon/templates-shared/contracts/BaseTemplate.sol";


contract BaseCache is BaseTemplate {
    // string constant private ERROR_MISSING_BASE_CACHE = "TEMPLATE_MISSING_BASE_CACHE";

    struct InstalledBase {
        ACL acl;
        Kernel dao;
        Finance finance;
        TokenManager tokenManager;
        Vault vault;
        Voting voting;
    }

    mapping (address => InstalledBase) internal baseCache;

    constructor(address[5] _deployedSetupContracts)
        BaseTemplate(
            DAOFactory(_deployedSetupContracts[0]),
            ENS(_deployedSetupContracts[1]),
            MiniMeTokenFactory(_deployedSetupContracts[2]),
            IFIFSResolvingRegistrar(_deployedSetupContracts[3])
    ) {}

    function _cacheBase(
        ACL _acl,
        Kernel _dao,
        Finance _finance,
        TokenManager _tokenManager,
        Vault _vault,
        Voting _voting,
        address _owner
    ) internal
    {
        InstalledBase storage baseInstance = baseCache[_owner];
        baseInstance.acl = _acl;
        baseInstance.dao = _dao;
        baseInstance.finance = _finance;
        baseInstance.tokenManager = _tokenManager;
        baseInstance.vault = _vault;
        baseInstance.voting = _voting;
    }

    function _popBaseCache(address _owner) internal returns (ACL, Kernel, Finance, TokenManager, Vault, Voting) {
        // require(baseCache[_owner] != address(0), ERROR_MISSING_BASE_CACHE);

        InstalledBase storage baseInstance = baseCache[_owner];
        ACL acl = baseInstance.acl;
        Kernel dao = baseInstance.dao;
        Finance finance = baseInstance.finance;
        TokenManager tokenManager = baseInstance.tokenManager;
        Vault vault = baseInstance.vault;
        Voting voting = baseInstance.voting;

        delete baseCache[_owner];
        return (acl, dao, finance, tokenManager, vault, voting);
    }
}
