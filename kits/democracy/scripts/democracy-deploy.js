const deployKit = require('@aragon/kits-beta-base/scripts/deploy_kit.js')

module.exports = async (callback) => {
  const deployConfig = {
    kitName: 'DemocracyKit',
    returnKit: true,
    artifacts,
  }

  const { address } = await deployKit(null, deployConfig)

  console.log(address)
  callback()
}