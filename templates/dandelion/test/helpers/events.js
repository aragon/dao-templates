const abi = require('web3-eth-abi')
const { APP_IDS } = require('./apps')

module.exports = artifacts => {
  function decodeEvents({ receipt }, contractAbi, eventName) {
    const eventAbi = contractAbi.filter(abi => abi.name === eventName && abi.type === 'event')[0]
    const eventSignature = abi.encodeEventSignature(eventAbi)
    const eventLogs = receipt.logs.filter(l => l.topics[0] === eventSignature)
    return eventLogs.map(log => {
      log.event = eventAbi.name
      log.args = abi.decodeLog(eventAbi.inputs, log.data, log.topics.slice(1))
      return log
    })
  }

  function getInstalledApps(receipt, appId) {
    const Kernel = artifacts.require('Kernel')
    const events = decodeEvents(receipt, Kernel.abi, 'NewAppProxy')
    const appEvents = events.filter(e => e.args.appId === appId)
    const installedAddresses = appEvents.map(e => e.args.proxy)
    return installedAddresses
  }

  function getInstalledAppsById(receipt) {
    return Object.keys(APP_IDS).reduce((apps, appName) => {
      apps[appName] = getInstalledApps(receipt, APP_IDS[appName])
      apps[appName].length === 0 && delete apps[appName]
      return apps
    }, {})
  }

  return {
    decodeEvents,
    getInstalledApps,
    getInstalledAppsById,
  }
}
