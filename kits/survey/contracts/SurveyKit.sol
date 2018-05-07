pragma solidity 0.4.18;

import "@aragon/os/contracts/apm/Repo.sol";
import "@aragon/os/contracts/factory/DAOFactory.sol";
import "@aragon/os/contracts/kernel/Kernel.sol";
import "@aragon/os/contracts/acl/ACL.sol";
import "@aragon/os/contracts/lib/minime/MiniMeToken.sol";
import "@aragon/os/contracts/lib/ens/ENS.sol";
import "@aragon/os/contracts/lib/ens/PublicResolver.sol";

import "@aragon/apps-survey/contracts/Survey.sol";


contract SurveyKit {
    ENS public ens;
    DAOFactory public fac;

    uint256 constant ONE_PERCENT = 10 ** 16;
    uint64 constant public VOTE_DURATION = 14 days;            // signaling votes are open for 14 days
    uint256 constant public ACCEPTANCE_QUORUM = 5 * ONE_PERCENT; // even if it has >50% support, at least 5% of holders need to approve for the signal to be valid 

    bytes32 constant public ETH_NODE = keccak256(bytes32(0), keccak256("eth"));
    bytes32 constant public APM_NODE = keccak256(ETH_NODE, keccak256("aragonpm"));
    bytes32 constant public SURVEY_APP_ID = keccak256(APM_NODE, keccak256("survey")); // survey.aragonpm.eth

    event DeployInstance(address dao);
    event InstalledApp(address appProxy, bytes32 appId);

    function SurveyKit(DAOFactory _fac, ENS _ens) {
        ens = _ens;
        fac = _fac; // factory must be set up w/o EVMScript support
    }

    function newInstance(MiniMeToken signalingToken, address surveyManager, address scapeHatch) returns (Kernel, Survey) {
        Kernel dao = fac.newDAO(this);
        ACL acl = ACL(dao.acl());

        acl.createPermission(this, dao, dao.APP_MANAGER_ROLE(), this);

        Survey survey = Survey(dao.newAppInstance(SURVEY_APP_ID, latestVersionAppBase(SURVEY_APP_ID))); 

        // TODO: Set scapeHatch address as the default vault, in case a token rescue is required
        // BLOCKED BY: https://github.com/aragon/aragonOS/pull/281

        survey.initialize(signalingToken, ACCEPTANCE_QUORUM, VOTE_DURATION);

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
