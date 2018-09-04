const deployDAOFactory = require('@aragon/os/scripts/deploy-daofactory.js')

module.exports = async (callback) => {
  const { daoFactory } = await deployDAOFactory(null, { artifacts, verbose: false })

  console.log(daoFactory.address)
  callback()
}
