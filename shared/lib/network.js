const DEFAULT_NETWORK = 'devnet'
const LOCAL_NETWORKS = ['devnet', 'rpc']

module.exports = web3 => {
  const Network = {
    async getNetworkId() {
      return new Promise((resolve, reject) =>
        web3.version.getNetwork((error, result) => error ? reject(error) : resolve(result))
      )
    },

    async getNetworkName() {
      const id = await Network.getNetworkId()
      const { networks } = require('@aragon/os/truffle-config')
      const networkName = Object.keys(networks).find(name => networks[name].network_id == id)
      return networkName || DEFAULT_NETWORK
    },

    async isLocalNetwork() {
      const networkName = await Network.getNetworkName()
      return LOCAL_NETWORKS.includes(networkName)
    },
  }

  return Network
}
