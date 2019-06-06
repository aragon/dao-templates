require('dotenv').config({ path: '../node_modules/@aragon/kits-beta-base/.env'})
const deploy_ens = require('@aragon/os/scripts/deploy-test-ens.js')
const deploy_apm = require('@aragon/os/scripts/deploy-apm.js')
const deploy_id = require('@aragon/id/scripts/deploy-beta-aragonid.js')
const deploy_kit = require('@aragon/kits-beta-base/scripts/deploy_kit.js')

const errorOut = (msg) => {
  console.error(msg)
  throw new Error(msg)
}

async function deploy() {
  console.log(`Deploying Democracy Kit, Owner ${process.env.OWNER}`)

  if (process.argv.length < 5) {
    errorOut('Usage: truffle exec --network <network> scripts/deploy.js')
  }
  // get network
  const network = process.argv[4]

  // ENS
  const { ens } = await deploy_ens(null, { artifacts })

  // APM
  await deploy_apm(null, {artifacts, web3, ensAddress: ens.address })

  // aragonID
  await deploy_id(null, { artifacts, web3, ensAddress: ens.address })

  await deploy_kit(null, { artifacts, kitName: 'democracy-akropolis', kitContractName: 'DemocracyKit', network: network, ensAddress: ens.address })
}

module.exports = callback => {
  deploy().then(() => callback()).catch(err => callback(err))
}
