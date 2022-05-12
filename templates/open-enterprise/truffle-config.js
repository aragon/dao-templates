// module.exports = require('@aragon/templates-shared/truffle.js')

const config = require('@aragon/truffle-config-v4')

const gasLimit = 7e6 - 1

config.networks.rpc.gas = gasLimit
config.networks.rinkeby.gas = gasLimit
config.networks.ropsten.gas = gasLimit
config.networks.kovan.gas = gasLimit
config.solc.optimizer.runs = 200

module.exports = config
