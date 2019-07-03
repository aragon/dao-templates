const getNetwork = require('../../../helpers/networks.js')
const { networks } = require('@aragon/os/truffle-config')
const { hash: namehash } = require('eth-ens-namehash')

const APP_IDS = ['agent', 'finance', 'token-manager', 'vault', 'voting'].reduce((ids, app) => {
    ids[app] = namehash(`${app}.aragonpm.eth`)
    return ids
}, {})

const getAddressesFileName = async (network = undefined) => {
    const networkName = network || (await getNetwork(networks)).name
    return ['devnet', 'rpc'].includes(networkName) ? 'arapp_local.json' : 'arapp.json'
}

const getDeployedAddresses = async (network = undefined) => {
    const networkName = network || (await getNetwork(networks)).name
    const arappFilename = ['devnet', 'rpc'].includes(networkName) ? 'arapp_local.json' : 'arapp.json'
    return require(`../${arappFilename}`).environments[networkName]
}

module.exports = {
    APP_IDS,
    getAddressesFileName,
    getDeployedAddresses,
}
