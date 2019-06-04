require('dotenv').config({ path: '../.env' })
const deploy_ens = require('@aragon/os/scripts/deploy-test-ens.js')
const deploy_apm = require('@aragon/os/scripts/deploy-apm.js')
const deploy_survey_kit = require('./deploy_survey_kit.js')

module.exports = async callback => {
  console.log(`Deploying Survey Kit, Owner ${process.env.OWNER}`)

  if (process.argv.length < 5) {
    errorOut('Usage: truffle exec --network <network> scripts/deploy.js')
  }
  // get network
  const network = process.argv[4]

  // ENS
  const { ens } = await deploy_ens(null, { artifacts })

  // APM
  await deploy_apm(null, { artifacts, web3, ensAddress: ens.address })

  await deploy_survey_kit(null, {
    artifacts,
    kitName: 'survey-kit',
    kitContractName: 'SurveyKit',
    network: network,
    ensAddress: ens.address,
  })
}
