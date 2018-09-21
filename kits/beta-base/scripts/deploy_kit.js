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

module.exports = async (
  truffleExecCallback,
  {
    artifacts = globalArtifacts,
    owner = defaultOwner,
    ensAddress = defaultENSAddress,
    kitName,
    network,
    verbose = true
  } = {}
) => {
  const log = (...args) => {
    if (verbose) { console.log(...args) }
  }

  log(`${kitName} in ${network} network`)

  const MiniMeTokenFactory = artifacts.require('MiniMeTokenFactory')
  const ENS = artifacts.require('ENS')

  const newRepo = async (apm, name, acc, contract) => {
    log(`Creating Repo for ${contract}`)
    const c = await artifacts.require(contract).new()
    return await apm.newRepoWithVersion(name, acc, [1, 0, 0], c.address, '0x1245')
  }

  log('owner', owner)

  if (network == 'rpc' && false) { // TODO!!
    log("Local testing network, exiting...")
    return;
  }

  let indexFileName
  if (network != 'rpc' && network != 'devnet') {
    indexFileName = 'index.js'
  } else {
    indexFileName = 'index_local.js'
  }

  if (ensAddress === undefined) {
    const betaIndex = require('../' + indexFileName)
    ensAddress = betaIndex.networks[network].ens
  }
  log('ens', ensAddress)
  const ens = ENS.at(ensAddress)

  const { daoFactory } = await deployDAOFactory(null, { artifacts, verbose: false })
  const minimeFac = await MiniMeTokenFactory.new()
  const aragonid = await ens.owner(namehash('aragonid.eth'))

  const kit = await artifacts.require(kitName).new(daoFactory.address, ens.address, minimeFac.address, aragonid, appIds)

  const ts = [ { name: kitName, address: kit.address } ]
  log(ts)

  if (network == 'devnet') { // Useful for testing to avoid manual deploys with aragon-dev-cli
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
