require('dotenv').config({ path: '../.env' })
const path = require('path')
const fs = require('fs')

const namehash = require('eth-ens-namehash').hash

const deployDAOFactory = require('@aragon/os/scripts/deploy-daofactory.js')
const ENS = artifacts.require('@aragon/os/contracts/lib/ens/ENS.sol')
const SurveyKit = artifacts.require('SurveyKit')

const surveyAppId = namehash('survey.aragonpm.eth')

const newRepo = async (apm, name, acc, contract, contentURI = "ipfs:") => {
  const c = await artifacts.require(contract).new()
  console.log('Creating apm repo for', name)
  return await apm.newRepoWithVersion(name, acc, [1, 0, 0], c.address, contentURI)
}

module.exports = async (callback) => {
  console.log('Deploying Survey Kit')

  const ens = ENS.at(process.env.ENS || '0x644f11d76d4b192df168c49a06db4928ea410bbc')
  const owner = process.env.OWNER

  console.log('ENS', ens.address)
  console.log('Owner', owner)

  const apmAddr = await artifacts.require('PublicResolver').at(await ens.resolver(namehash('aragonpm.eth'))).addr(namehash('aragonpm.eth'))
  const apm = artifacts.require('APMRegistry').at(apmAddr)

  // get network
  if (process.argv.length < 5) {
    errorOut('Usage: truffle exec --network <network> scripts/deploy.js')
  }
  const network = process.argv[4]
  if (network == 'rpc' /*TODO!*/ || network == 'devnet') { // Useful for testing to avoid manual deploys with aragon-dev-cli
    if (await ens.owner(surveyAppId) == '0x0000000000000000000000000000000000000000') {
      console.log('Deploying Survey App', network)

      await newRepo(apm, 'survey', owner, 'Survey')
    }
  }

  const { daoFactory } = await deployDAOFactory(null, { artifacts, verbose: false, withEvmScriptRegistryFactory: false })
  console.log('DAO factory', daoFactory.address)

  const kit = await SurveyKit.new(daoFactory.address, ens.address)
  console.log('SurveyKit:', kit.address)

  console.log('Creating APM package for SurveyKit')

  await apm.newRepoWithVersion('survey-kit', owner, [1, 0, 0], kit.address, 'ipfs:')
  console.log('APM package created')
}
