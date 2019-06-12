require('dotenv').config({ path: '../node_modules/@aragon/kits-beta-base/.env'})
const deploy_ens = require('@aragon/os/scripts/deploy-test-ens.js')
const deploy_apm = require('@aragon/os/scripts/deploy-apm.js')
const deploy_id = require('@aragon/id/scripts/deploy-beta-aragonid.js')
const deploy_kit = require('@aragon/kits-beta-base/scripts/deploy_kit.js')

module.exports = async (callback) => {
  console.log(`Deploying Trust kit, Owner ${process.env.OWNER}`)

  if (process.argv.length < 5) {
    const message = 'Usage: truffle exec --network <network> ./scripts/deploy.js'
    console.error(message)
    throw new Error(message)
  }

  // get network
  const network = process.argv[4]

  // ENS
  const { ens } = await deploy_ens(null, { artifacts })

  // APM
  await deploy_apm(null, {artifacts, web3, ensAddress: ens.address })

  // aragonID
  await deploy_id(null, { artifacts, web3, ensAddress: ens.address })

  await deploy_kit(null, { artifacts, kitName: 'trust-kit', kitContractName: 'TrustKit', network: network, ensAddress: ens.address })
}
