const getNetwork = require('../../../helpers/networks.js')
const { networks } = require('@aragon/os/truffle-config')
const { hash: namehash } = require('eth-ens-namehash')

const APP_IDS = ['agent', 'finance', 'token-manager', 'vault', 'voting'].reduce((ids, app) => {
    ids[app] = namehash(`${app}.aragonpm.eth`)
    return ids
}, {})

const getDeployedAddresses = async () => {
    const { name: networkName } = await getNetwork(networks)
    const arappFilename = ['devnet', 'rpc'].includes(networkName) ? 'arapp_local' : 'arapp'
    return require(`../${arappFilename}`).environments[networkName]
}

module.exports = {
    APP_IDS,
    getDeployedAddresses
}
