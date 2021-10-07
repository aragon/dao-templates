require('./tasks/deploy-contract')
const config = require('@aragon/hardhat-config')

config.solidity = {
  compilers: [
    {
      version: "0.5.0"
    },
    {
      version: "0.4.24"
    }
  ],
  settings: {
    optimizer: {
      enabled: true,
      runs: 200,
    },
  },
}

module.exports = config

