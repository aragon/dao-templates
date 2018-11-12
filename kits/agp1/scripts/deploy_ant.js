const getAccounts = require('@aragon/os/scripts/helpers/get-accounts')

module.exports = async (callback) => {
  let owner = process.env.OWNER

  const accounts = await getAccounts(web3)
  if (!owner) {
    owner = accounts[0]
    console.log('OWNER env variable not found, setting ANT owner to the provider\'s first account')
  }
  console.log('Owner:', owner)

  const factory = await artifacts.require('MiniMeTokenFactory').new()
  const ant = await artifacts.require('ANT').new(factory.address)
  console.log('ANT token address: ', ant.address)
  await ant.changeController(owner)
  await ant.generateTokens(owner, 10**24)

  callback()
}
