const deploy_survey_kit = require('./deploy_survey_kit.js')

// Make sure that you have deployed ENS and APM and that you set the first one
// in `ENS` env variable
module.exports = async callback => {
  const deployConfig = {
    artifacts,
    kitName: 'survey-kit',
    kitContractName: 'SurveyKit',
    returnKit: true,
  }

  const { address } = await deploy_survey_kit(null, deployConfig)

  console.log(address)
  callback()
}
