pragma solidity 0.4.18;

import "@aragon/os/contracts/apm/Repo.sol";
import "@aragon/os/contracts/factory/DAOFactory.sol";
import "@aragon/os/contracts/kernel/Kernel.sol";
import "@aragon/os/contracts/acl/ACL.sol";
import "@aragon/os/contracts/lib/minime/MiniMeToken.sol";
import "@aragon/os/contracts/lib/ens/ENS.sol";
import "@aragon/os/contracts/lib/ens/PublicResolver.sol";
import "@aragon/os/contracts/ens/ENSConstants.sol";

import "@aragon/apps-survey/contracts/Survey.sol";


contract SurveyKit is ENSConstants {
    ENS public ens;
    DAOFactory public fac;

    bytes32 constant public APM_NODE = keccak256(ETH_TLD_NODE, keccak256("aragonpm"));
    bytes32 constant public SURVEY_APP_ID = keccak256(APM_NODE, keccak256("survey")); // survey.aragonpm.eth

    event DeployInstance(address dao);
    event InstalledApp(address appProxy, bytes32 appId);

    function SurveyKit(DAOFactory _fac, ENS _ens) {
        ens = _ens;
        fac = _fac; // factory must be set up w/o EVMScript support
    }

    function newInstance(MiniMeToken signalingToken, address surveyManager, address scapeHatch, uint64 duration, uint256 participation) returns (Kernel, Survey) {
        Kernel dao = fac.newDAO(this);
        ACL acl = ACL(dao.acl());

        acl.createPermission(this, dao, dao.APP_MANAGER_ROLE(), this);

        Survey survey = Survey(dao.newAppInstance(SURVEY_APP_ID, latestVersionAppBase(SURVEY_APP_ID)));

        // TODO: Set scapeHatch address as the default vault, in case a token rescue is required
        // BLOCKED BY: https://github.com/aragon/aragonOS/pull/281

        survey.initialize(signalingToken, participation, duration);

        // set survey manager as the entity that can create votes and change participation
        // surveyManager can then give this permission to other entities
        acl.createPermission(surveyManager, survey, survey.CREATE_SURVEYS_ROLE(), surveyManager);
        acl.createPermission(surveyManager, survey, survey.MODIFY_PARTICIPATION_ROLE(), surveyManager);
        acl.grantPermission(surveyManager, dao, dao.APP_MANAGER_ROLE());
        acl.setPermissionManager(surveyManager, dao, dao.APP_MANAGER_ROLE());


        InstalledApp(survey, SURVEY_APP_ID);
        DeployInstance(dao);

        return (dao, survey);
    }

    function latestVersionAppBase(bytes32 appId) public view returns (address base) {
        Repo repo = Repo(PublicResolver(ens.resolver(appId)).addr(appId));
        (,base,) = repo.getLatest();

        return base;
    }
}
