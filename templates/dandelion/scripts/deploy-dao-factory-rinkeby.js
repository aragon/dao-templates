const ACL = artifacts.require("ACL")
const DAOFactory = artifacts.require("DAOFactory")
const EVMScriptRegistryFactory = artifacts.require("EVMScriptRegistryFactory")

const BASE_KERNEL_RINKEBY_ADDRESS = "0xaa1A0367C7588937cbF542EF79cbfE83D317DA88"

module.exports = async callback => {
  try {
    console.log(`Creating ACL...`)
    const acl = await ACL.new()
    console.log(`Deployed acl: ${acl.address}`)

    console.log(`\nCreating EVMScriptRegistryFactory...`)
    const evmScriptRegistryFactory = await EVMScriptRegistryFactory.new()
    console.log(`Deployed evmScriptRegistryFactory: ${evmScriptRegistryFactory.address}`)

    console.log(`\nCreating DAOFactory...`)
    const daoFactory = await DAOFactory.new(BASE_KERNEL_RINKEBY_ADDRESS, acl.address, evmScriptRegistryFactory.address)
    console.log(`Deployed daoFactory: ${daoFactory.address}`)

  } catch (error) {
    callback(error)
  }
  callback()
}