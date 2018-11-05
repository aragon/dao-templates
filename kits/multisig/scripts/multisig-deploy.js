const deployKit = require('@aragon/kits-beta-base/scripts/deploy_kit.js')

// Make sure that you have deployed ENS and APM and that you set the first one
// in `ENS` env variable
module.exports = async (callback) => {
  const deployConfig = {
    artifacts,
    kitName: 'multisig-kit',
    kitContractName: 'MultisigKit',
    returnKit: true,
  }

  const { address } = await deployKit(null, deployConfig)

  console.log(address)
  callback()
}
