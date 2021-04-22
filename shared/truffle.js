const config = require('@aragon/os/truffle-config')

const HDWalletProvider = require('truffle-hdwallet-provider');
const gasLimit = 7e6 - 1

config.networks.rpc.gas = gasLimit
config.networks.rinkeby.gas = gasLimit
config.networks.ropsten.gas = gasLimit
config.networks.kovan.gas = gasLimit

config.networks.devnet = {
  provider: function() {
      return new HDWalletProvider(
        process.env.MNEMONIC,
        process.env.WEB3_URL,
        process.env.ADDRESS_NUMBER,
      )
    },
  network_id: process.env.CHAIN_ID,
  gas: 8e6,
  gasPrice: 1e9,
}

module.exports = config
