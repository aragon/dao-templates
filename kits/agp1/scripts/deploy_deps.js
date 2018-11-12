const namehash = require('eth-ens-namehash').hash

const getAccounts = require('@aragon/os/scripts/helpers/get-accounts')
const deploy_ens = require('@aragon/os/scripts/deploy-test-ens.js')
const deploy_apm = require('@aragon/os/scripts/deploy-apm.js')

// ensure alphabetic order
const apps = ['finance', 'vault', 'voting']
const appIds = apps.map(app => namehash(require(`@aragon/apps-${app}/arapp`).environments.default.appName))

const newRepo = async (apm, name, acc, contract) => {
  console.log(`Creating Repo for ${contract}`)
  const c = await artifacts.require(contract).new()
  return await apm.newRepoWithVersion(name, acc, [1, 0, 0], c.address, '0x1245')
}

module.exports = async (callback) => {
  const errorOut = (msg) => {
    console.error(msg)
    throw new Error(msg)
  }

  let owner = process.env.OWNER
  const accounts = await getAccounts(web3)
  if (!owner) {
    owner = accounts[0]
    console.log('OWNER env variable not found, setting APM owner to the provider\'s first account')
  }
  console.log(`Deploying dependencies, owner: ${owner}`)

  if (process.argv.length < 5) {
    errorOut('Usage: truffle exec --network <network> scripts/deploy_deps.js')
  }
  // get network
  const network = process.argv[4]

  console.log(network)
  // ENS
  const { ens } = await deploy_ens(null, { artifacts, web3, owner })

  // APM
  await deploy_apm(null, {artifacts, web3, owner, ensAddress: ens.address })

  if (network == 'devnet' || network == 'rpc') { // Useful for testing to avoid manual deploys with aragon-dev-cli
    const apmAddr = await artifacts.require('PublicResolver').at(await ens.resolver(namehash('aragonpm.eth'))).addr(namehash('aragonpm.eth'))
    const apm = artifacts.require('APMRegistry').at(apmAddr)
    console.log('APM', apmAddr);

    if (await ens.owner(appIds[0]) == '0x0000000000000000000000000000000000000000') {
      console.log('Deploying apps in local network')
      await newRepo(apm, 'finance', owner, 'Finance')
      await newRepo(apm, 'vault', owner, 'Vault')
      await newRepo(apm, 'voting', owner, 'Voting')
    }
  }

  console.log(ens.address)
}
