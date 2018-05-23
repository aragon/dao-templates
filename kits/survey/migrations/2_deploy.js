const path = require('path')
const fs = require('fs')

const namehash = require('eth-ens-namehash').hash

const daoFactoryMigration = require('@aragon/os/migrations/3_factory')

const surveyAppId = namehash('survey.aragonpm.eth')

const newRepo = async (apm, name, acc, contract, contentURI = "ipfs:") => {
  const c = await contract.new()
  console.log('creating apm repo for', name)
  return await apm.newRepoWithVersion(name, acc, [1, 0, 0], c.address, contentURI)
}

module.exports = async (deployer, network, accounts, arts = null) => {
  if (arts != null) artifacts = arts // allow running outside

  const ENS = artifacts.require('@aragon/os/contracts/lib/ens/ENS.sol')
  const SurveyKit = artifacts.require('SurveyKit')
  const Survey = artifacts.require('Survey')

  const ens = ENS.at(
    process.env.ENS ||
    '0x5f6f7e8cc7346a11ca2def8f827b7a0b612c56a1' // aragen's default ENS
  )

  const apmAddr = await artifacts.require('PublicResolver').at(await ens.resolver(namehash('aragonpm.eth'))).addr(namehash('aragonpm.eth'))

  if (network == 'rpc' /*TODO!*/ || network == 'devnet') { // Useful for testing to avoid manual deploys with aragon-dev-cli
    if (await ens.owner(surveyAppId) == '0x0000000000000000000000000000000000000000') {
      const apm = artifacts.require('APMRegistry').at(apmAddr)

      await newRepo(apm, 'survey', accounts[0], Survey)
    }
  }

  const { daoFact } = await daoFactoryMigration(deployer, network, accounts, artifacts)

  const kit = await SurveyKit.new(daoFact.address, ens.address)
  console.log('SurveyKit:', kit.address)

  console.log('creating APM package for SurveyKit')
  const apm = artifacts.require('APMRegistry').at(apmAddr)
  await apm.newRepoWithVersion('survey-template', accounts[0], [1, 0, 0], kit.address, 'ipfs:')

  return kit.address
}
