module.exports = (web3, artifacts) => {
  const { isGanache } = require('./node')(web3)
  const timeTravel = require('@aragon/test-helpers/timeTravel')(web3)
  const Timestamp = artifacts.require('Timestamp')

  return async s => {
    if (isGanache()) return timeTravel(s)
    const previousTime = await (await Timestamp.new()).getNow()
    await new Promise(resolve => setTimeout(resolve, s * 1000))
    const currentTime = await (await Timestamp.new()).getNow()
    assert.isAtLeast(currentTime.minus(s).toNumber(), previousTime.toNumber(), `sleep/time-travel helper failed to increase ${s} seconds`)
  }
}
