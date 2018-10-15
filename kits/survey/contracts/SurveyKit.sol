pragma solidity 0.4.24;

import "@aragon/os/contracts/apm/APMNamehash.sol";
import "@aragon/os/contracts/apm/Repo.sol";
import "@aragon/os/contracts/factory/DAOFactory.sol";
import "@aragon/os/contracts/kernel/Kernel.sol";
import "@aragon/os/contracts/acl/ACL.sol";
import "@aragon/apps-shared-minime/contracts/MiniMeToken.sol";
import "@aragon/os/contracts/lib/ens/ENS.sol";
import "@aragon/os/contracts/lib/ens/PublicResolver.sol";

import "@aragon/apps-survey/contracts/Survey.sol";

import "@aragon/kits-bare/contracts/KitBase.sol";


contract SurveyKit is APMNamehash, KitBase {
    ENS public ens;
    DAOFactory public fac;

    bytes32 constant public SURVEY_APP_ID = apmNamehash("survey"); // survey.aragonpm.eth

    event DeployInstance(address dao, address indexed token);

    // factory must be set up w/o EVMScript support
    constructor(DAOFactory _fac, ENS _ens) KitBase(_fac, _ens) public {}

    function newInstance(
        MiniMeToken signalingToken,
        address surveyManager,
        address escapeHatch,
        uint64 duration,
        uint256 participation
    )
        public
        returns (Kernel, Survey)
    {
        Kernel dao = fac.newDAO(this);
        ACL acl = ACL(dao.acl());

        acl.createPermission(this, dao, dao.APP_MANAGER_ROLE(), this);

        Survey survey = Survey(dao.newAppInstance(SURVEY_APP_ID, latestVersionAppBase(SURVEY_APP_ID)));

        // Set escapeHatch address as the default vault, in case a token rescue is required
        dao.setApp(dao.APP_BASES_NAMESPACE(), dao.DEFAULT_VAULT_APP_ID(), escapeHatch);

        survey.initialize(signalingToken, participation, duration);

        // Set survey manager as the entity that can create votes and change participation
        // surveyManager can then give this permission to other entities
        acl.createPermission(surveyManager, survey, survey.CREATE_SURVEYS_ROLE(), surveyManager);
        acl.createPermission(surveyManager, survey, survey.MODIFY_PARTICIPATION_ROLE(), surveyManager);
        acl.grantPermission(surveyManager, dao, dao.APP_MANAGER_ROLE());
        acl.setPermissionManager(surveyManager, dao, dao.APP_MANAGER_ROLE());

        cleanupDAOPermissions(dao, acl, surveyManager);

        emit InstalledApp(survey, SURVEY_APP_ID);
        emit DeployInstance(dao, signalingToken);

        return (dao, survey);
    }
}
