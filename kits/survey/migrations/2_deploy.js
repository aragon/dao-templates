const path = require('path')
const fs = require('fs')

const namehash = require('eth-ens-namehash').hash

const deployDAOFactory = require('@aragon/os/scripts/deploy-daofactory.js')
const ENS = artifacts.require('@aragon/os/contracts/lib/ens/ENS.sol')
const SurveyKit = artifacts.require('SurveyKit')

const surveyAppId = namehash('survey.aragonpm.eth')

const newRepo = async (apm, name, acc, contract, contentURI = "ipfs:") => {
  const c = await artifacts.require(contract).new()
  console.log('creating apm repo for', name)
  return await apm.newRepoWithVersion(name, acc, [1, 0, 0], c.address, contentURI)
}

module.exports = async (deployer, network, accounts) => {
  const ens = ENS.at(process.env.ENS || '0x644f11d76d4b192df168c49a06db4928ea410bbc')

  const apmAddr = await artifacts.require('PublicResolver').at(await ens.resolver(namehash('aragonpm.eth'))).addr(namehash('aragonpm.eth'))

  if (network == 'rpc' /*TODO!*/ || network == 'devnet') { // Useful for testing to avoid manual deploys with aragon-dev-cli
    if (await ens.owner(surveyAppId) == '0x0000000000000000000000000000000000000000') {
      const apm = artifacts.require('APMRegistry').at(apmAddr)

      await newRepo(apm, 'survey', accounts[0], 'Survey')
    }
  }

  const { daoFactory } = await deployDAOFactory(null, { artifacts, verbose: false })

  const kit = await SurveyKit.new(daoFactory.address, ens.address)
  console.log('SurveyKit:', kit.address)

  return

  console.log('creating APM package for SurveyKit')

  const apm = artifacts.require('APMRegistry').at(apmAddr)
  await apm.newRepoWithVersion('survey-template', accounts[0], [1, 0, 0], kit.address, 'ipfs:')
}
