const fs = require('fs')

const namehash = require('eth-ens-namehash').hash

const deploy_ens = require('@aragon/os/scripts/deploy-beta-ens.js')
const deploy_apm = require('@aragon/os/scripts/deploy-beta-apm.js')
const deploy_id = require('@aragon/id/scripts/deploy-beta-aragonid.js')

// ensure alphabetic order
const apps = ['finance', 'token-manager', 'vault', 'voting']
const appIds = apps.map(app => namehash(require(`@aragon/apps-${app}/arapp`).appName))

const newRepo = async (apm, name, acc, contract) => {
  console.log(`Creating Repo for ${contract}`)
  const c = await artifacts.require(contract).new()
  return await apm.newRepoWithVersion(name, acc, [1, 0, 0], c.address, '0x1245')
}

const owner = process.env.OWNER

module.exports = async (callback) => {
  console.log('Deploying Democracy Kit')

  if (process.argv.length < 5) {
    errorOut('Usage: truffle exec --network <network> scripts/deploy_deps.js')
  }
  // get network
  const network = process.argv[4]

  // ENS
  const { ens } = await deploy_ens(null, { artifacts })

  // APM
  await deploy_apm(null, {artifacts, ensAddress: ens.address })

  // aragonID
  await deploy_id(null, { artifacts, ensAddress: ens.address })

  if (network == 'devnet') { // Useful for testing to avoid manual deploys with aragon-dev-cli
    const apmAddr = await artifacts.require('PublicResolver').at(await ens.resolver(namehash('aragonpm.eth'))).addr(namehash('aragonpm.eth'))
    const apm = artifacts.require('APMRegistry').at(apmAddr)
    console.log('APM', apmAddr);

    if (await ens.owner(appIds[0]) == '0x0000000000000000000000000000000000000000') {
      console.log('Deploying apps in local network')
      await newRepo(apm, 'voting', owner, 'Voting')
      await newRepo(apm, 'finance', owner, 'Finance')
      await newRepo(apm, 'token-manager', owner, 'TokenManager')
      await newRepo(apm, 'vault', owner, 'Vault')
    }
  }

  const indexFileName = 'index_local.js'
  let indexObj = {}
  if (fs.existsSync(__dirname + '/../' + indexFileName))
    indexObj = require('../' + indexFileName)
  if (indexObj.networks === undefined)
    indexObj.networks = {}
  if (indexObj.networks[network] === undefined)
    indexObj.networks[network] = {}
  indexObj.networks[network].ens = ens.address

  const indexFile = 'module.exports = ' + JSON.stringify(indexObj, null, 2)
  // could also use https://github.com/yeoman/stringify-object if you wanted single quotes
  fs.writeFileSync(indexFileName, indexFile)
}
