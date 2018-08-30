const daoFactoryMigration = require('@aragon/os/migrations/3_factory')

module.exports = async () => {
	const { daoFact } = await daoFactoryMigration(Promise.resolve(), null, null, artifacts)
	console.log(daoFact.address)
}