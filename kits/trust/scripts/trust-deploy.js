const deployKit = require('@aragon/kits-beta-base/scripts/deploy_kit.js')

// Make sure that you have deployed ENS and APM and that you set the first one in `ENS` env variable

module.exports = async (callback) => {
  const network = process.argv[process.argv.findIndex(arg => arg === '--network') + 1]

  const deployConfig = {
    artifacts,
    network,
    kitName: 'trust-kit',
    kitContractName: 'TrustKit',
    returnKit: true,
  }

  const { address } = await deployKit(null, deployConfig)

  console.log(address)
  callback()
}
