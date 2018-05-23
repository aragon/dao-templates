const daoFactoryMigration = require('@aragon/os/migrations/3_factory')

module.exports = async callback => {
	const { daoFact } = await daoFactoryMigration(null, null, null, artifacts)
	console.log(daoFact.address)
}