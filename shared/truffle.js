const config = require('@aragon/os/truffle-config')

const gasLimit = 7e6 - 1

config.networks.rpc.gas = gasLimit
config.networks.devnet.gas = gasLimit
config.networks.rinkeby.gas = gasLimit
config.networks.ropsten.gas = gasLimit
config.networks.kovan.gas = gasLimit

module.exports = config
