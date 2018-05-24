const path = require('path')
const fs = require('fs')

const namehash = require('eth-ens-namehash').hash

const daoFactoryMigration = require('@aragon/os/migrations/3_factory')

const surveyAppId = namehash('survey.aragonpm.eth')

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

  console.log('Deploying DAOFactory...')
  const { daoFact } = await daoFactoryMigration(deployer, network, accounts, artifacts)

  console.log('Deploying SurveyKit...')
  const kit = await SurveyKit.new(daoFact.address, ens.address)

  console.log('Creating APM package for SurveyKit...')
  const apm = artifacts.require('APMRegistry').at(apmAddr)
  await apm.newRepoWithVersion('survey-kit', accounts[0], [1, 0, 0], kit.address, 'ipfs:')

  console.log('SurveyKit:', kit.address)

  return kit.address
}
