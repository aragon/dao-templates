const path = require('path')
const fs = require('fs')

const namehash = require('eth-ens-namehash').hash

const daoFactoryMigration = require('@aragon/os/migrations/3_factory')
const ENS = artifacts.require('@aragon/os/contracts/lib/ens/ENS.sol')
const TCRKit = artifacts.require('TCRKit')

const curationAppId = namehash('tcr.aragonpm.eth')

const newRepo = async (apm, name, acc, contract, contentURI = "ipfs:") => {
  const c = await artifacts.require(contract).new()
  console.log('creating apm repo for', name)
  return await apm.newRepoWithVersion(name, acc, [1, 0, 0], c.address, contentURI)
}

module.exports = async (deployer, network, accounts) => {
  let indexFileName
  if (network != 'rpc' && network != 'devnet') {
    indexFileName = 'index.js'
  } else {
    indexFileName = 'index_local.js'
  }
  let indexObj = require('../' + indexFileName)

  console.log('ens', indexObj.networks[network].ens)
  const ens = ENS.at(indexObj.networks[network].ens)

  const apmAddr = await artifacts.require('PublicResolver').at(await ens.resolver(namehash('aragonpm.eth'))).addr(namehash('aragonpm.eth'))
  console.log('APM address', apmAddr)

  if (network == 'rpc' || network == 'devnet') { // Useful for testing to avoid manual deploys with aragon-dev-cli
    if (await ens.owner(curationAppId) == '0x0000000000000000000000000000000000000000') {
      const apm = artifacts.require('APMRegistry').at(apmAddr)

      await newRepo(apm, 'registry', accounts[0], 'RegistryApp')
      await newRepo(apm, 'staking', accounts[0], 'Staking')
      await newRepo(apm, 'plcr', accounts[0], 'PLCR')
      await newRepo(apm, 'tcr', accounts[0], 'Curation')
    }
  }

  const { daoFact } = await daoFactoryMigration(deployer, network, accounts, artifacts)

  const kit = await TCRKit.new(daoFact.address, ens.address)
  console.log('TCRKit:', kit.address)

  if (indexObj.networks[network] === undefined)
    indexObj.networks[network] = {}
  indexObj.networks[network].ens = ens.address
  indexObj.networks[network].tcr_kit = kit.address
  const indexFile = 'module.exports = ' + JSON.stringify(indexObj, null, 2)
  fs.writeFileSync(indexFileName, indexFile)
  console.log('Settings saved to ' + indexFileName)
}
