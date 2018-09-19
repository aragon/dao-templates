const deployDAOFactory = require('@aragon/os/scripts/deploy-daofactory.js')
const BareKit = artifacts.require('BareKit')

const ensAddr = process.env.ENS

module.exports = async (callback) => {
  if (!ensAddr) {
    callback(new Error("ENS address not found in environment variable ENS"))
  }

  const { daoFactory } = await deployDAOFactory(null, { artifacts, verbose: false })

  const bareKit = await BareKit.new(daoFactory.address, ensAddr)
  console.log(bareKit.address)

  callback()
}
