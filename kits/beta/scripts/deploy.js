const path = require('path')
const fs = require('fs')

const namehash = require('eth-ens-namehash').hash

const deployDAOFactory = require('@aragon/os/scripts/deploy-daofactory.js')
const MiniMeTokenFactory = artifacts.require('@aragon/os/contracts/lib/minime/MiniMeTokenFactory')
const ENS = artifacts.require('@aragon/os/contracts/lib/ens/ENS.sol')

const templates = ['DemocracyTemplate', 'MultisigTemplate']

// ensure alphabetic order
const apps = ['finance', 'token-manager', 'vault', 'voting']

const appIds = apps.map(app => namehash(require(`@aragon/apps-${app}/arapp`).appName))

const deployMany = async (cs, params) => {
  const x = await Promise.all(cs.map(c => artifacts.require(c).new(...params)))

  return x.map(c => c.address)
}

const newRepo = async (apm, name, acc, contract) => {
  const c = await artifacts.require(contract).new()
  return await apm.newRepoWithVersion(name, acc, [1, 0, 0], c.address, '0x1245')
}

module.exports = async (callback) => {
  if (process.argv.length < 5) {
    errorOut('Usage: truffle exec --network <network> scripts/deploy.js')
  }
  // get network
  const network = process.argv[4]
  console.log('network', network)

  const owner = process.env.OWNER
  console.log('owner', owner)

  if (network == 'rpc' && false) { // TODO!!
    console.log("Local testing network, exiting...")
    return;
  }
  let indexObj = require('../index.js')
  const ens = ENS.at(process.env.ENS || indexObj.networks[network].ens)
  console.log('ens', ens.address)

  const apmAddr = await artifacts.require('PublicResolver').at(await ens.resolver(namehash('aragonpm.eth'))).addr(namehash('aragonpm.eth'))
  const apm = artifacts.require('APMRegistry').at(apmAddr)
  console.log('APM', apmAddr);

  if (network == 'rpc' /*TODO!*/ || network == 'devnet') { // Useful for testing to avoid manual deploys with aragon-dev-cli
    if (await ens.owner(appIds[0]) == '0x0000000000000000000000000000000000000000') {

      await newRepo(apm, 'voting', owner, 'Voting')
      await newRepo(apm, 'finance', owner, 'Finance')
      await newRepo(apm, 'token-manager', owner, 'TokenManager')
      await newRepo(apm, 'vault', owner, 'Vault')
    }
  }

  const { daoFactory } = await deployDAOFactory(null, { artifacts, verbose: false })

  const minimeFac = await MiniMeTokenFactory.new()

  const aragonid = await ens.owner(namehash('aragonid.eth'))
  const tmpls = await deployMany(templates, [daoFactory.address, ens.address, minimeFac.address, aragonid, appIds])

  const ts = tmpls.map((address, i) => ({ name: templates[i], address }) )

  console.log('creating APM packages for templates')

  await apm.newRepoWithVersion('democracy-template', owner, [1, 0, 0], tmpls[0], 'ipfs:')
  await apm.newRepoWithVersion('multisig-template', owner, [1, 0, 0], tmpls[1], 'ipfs:')

  console.log(ts)

  if (indexObj.networks[network] === undefined)
    indexObj.networks[network] = {}
  indexObj.networks[network].ens = ens.address
  indexObj.networks[network].templates = ts
  delete indexObj.templates
  const indexFile = 'module.exports = ' + JSON.stringify(indexObj, null, 2)
  // could also use https://github.com/yeoman/stringify-object if you wanted single quotes
  if (network != 'rpc' && network != 'devnet') {
    fs.writeFileSync('index.js', indexFile)
    console.log('Template addresses saved to index.js')
  } else {
    fs.writeFileSync('index_local.js', indexFile)
    console.log('Template addresses saved to index_local.js')
  }

  callback()
}
