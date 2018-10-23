require('dotenv').config({ path: '../.env' })
const path = require('path')
const fs = require('fs')

const namehash = require('eth-ens-namehash').hash

const deployDAOFactory = require('@aragon/os/scripts/deploy-daofactory.js')

// ensure alphabetic order
const apps = ['finance', 'token-manager', 'vault', 'voting']
const appIds = apps.map(app => namehash(require(`@aragon/apps-${app}/arapp`).appName))

const globalArtifacts = this.artifacts // Not injected unless called directly via truffle
const defaultOwner = process.env.OWNER
const defaultENSAddress = process.env.ENS
const defaultDAOFactoryAddress = process.env.DAO_FACTORY
const defaultMinimeTokenFactoryAddress = process.env.MINIME_TOKEN_FACTORY

module.exports = async (
  truffleExecCallback,
  {
    artifacts = globalArtifacts,
    owner = defaultOwner,
    ensAddress = defaultENSAddress,
    daoFactoryAddress = defaultDAOFactoryAddress,
    minimeTokenFactoryAddress = defaultMinimeTokenFactoryAddress,
    kitName,
    network,
    verbose = true,
    returnKit = false
  } = {}
) => {
  const log = (...args) => {
    if (verbose) { console.log(...args) }
  }

  log(`${kitName} in ${network} network`)

  const MiniMeTokenFactory = artifacts.require('MiniMeTokenFactory')
  const DAOFactory = artifacts.require('DAOFactory')
  const ENS = artifacts.require('ENS')

  const newRepo = async (apm, name, acc, contract) => {
    log(`Creating Repo for ${contract}`)
    const c = await artifacts.require(contract).new()
    return await apm.newRepoWithVersion(name, acc, [1, 0, 0], c.address, '0x1245')
  }

  let indexFileName
  if (!returnKit) {
    if (network != 'rpc' && network != 'devnet') {
      indexFileName = 'index.js'
    } else {
      indexFileName = 'index_local.js'
    }
  }

  if (returnKit && !ensAddress) {
    errorOut('ENS environment variable not passed, aborting.')
  }

  if (!ensAddress) {
    const betaIndex = require('../' + indexFileName)
    ensAddress = betaIndex.networks[network].ens
  }
  log('Using ENS', ensAddress)
  const ens = ENS.at(ensAddress)

  let daoFactory
  if (daoFactoryAddress) {
    log(`Using provided DAOFactory: ${daoFactoryAddress}`)
    daoFactory = DAOFactory.at(daoFactoryAddress)
  } else {
    daoFactory = (await deployDAOFactory(null, { artifacts, verbose: false })).daoFactory
    log('Deployed DAOFactory:', daoFactory.address)
  }

  let minimeFac
  if (minimeTokenFactoryAddress) {
    log(`Using provided MiniMeTokenFactory: ${minimeTokenFactoryAddress}`)
    minimeFac = MiniMeTokenFactory.at(minimeTokenFactoryAddress)
  } else {
    minimeFac = await MiniMeTokenFactory.new()
    log('Deployed MiniMeTokenFactory:', minimeFac.address)
  }

  const aragonid = await ens.owner(namehash('aragonid.eth'))
  const kit = await artifacts.require(kitName).new(daoFactory.address, ens.address, minimeFac.address, aragonid, appIds)

  if (returnKit) {
    return kit
  }

  const ts = [ { name: kitName, address: kit.address } ]
  log(ts)

  if (network == 'devnet') { // Useful for testing to avoid manual deploys with aragon-dev-cli
    log('Creating APM package with owner', owner)
    const apmAddr = await artifacts.require('PublicResolver').at(await ens.resolver(namehash('aragonpm.eth'))).addr(namehash('aragonpm.eth'))
    const apm = artifacts.require('APMRegistry').at(apmAddr)
    log('APM', apmAddr);

    if (await ens.owner(appIds[0]) == '0x0000000000000000000000000000000000000000') {
      log('Deploying apps in local network')
      await newRepo(apm, 'voting', owner, 'Voting')
      await newRepo(apm, 'finance', owner, 'Finance')
      await newRepo(apm, 'token-manager', owner, 'TokenManager')
      await newRepo(apm, 'vault', owner, 'Vault')
    }

    if (await ens.owner(namehash(kitName + '.aragonpm.eth')) == '0x0000000000000000000000000000000000000000') {
      log(`creating APM package for ${kitName} at ${kit.address}`)
      await apm.newRepoWithVersion(kitName, owner, [1, 0, 0], kit.address, 'ipfs:')
    } else {
      // TODO: update APM Repo?
    }
  }

  const kitIndexPath = path.resolve(".") + "/" + indexFileName
  let indexObj = {}
  if (fs.existsSync(kitIndexPath))
    indexObj = require(kitIndexPath)
  if (indexObj.networks === undefined)
    indexObj.networks = {}
  if (indexObj.networks[network] === undefined)
    indexObj.networks[network] = {}
  indexObj.networks[network].ens = ens.address
  indexObj.networks[network].kits = ts
  const indexFile = 'module.exports = ' + JSON.stringify(indexObj, null, 2)
  // could also use https://github.com/yeoman/stringify-object if you wanted single quotes
  fs.writeFileSync(indexFileName, indexFile)
  log(`Kit addresses saved to ${indexFileName}`)

  if (typeof truffleExecCallback === 'function') {
    // Called directly via `truffle exec`
    truffleExecCallback()
  } else {
    return indexObj
  }
}
