const fs = require('fs')
const path = require('path')

const FILE_NAME = 'arapp.json'
const LOCAL_FILE_NAME = 'arapp_local.json'
const DEFAULT_ARAPP_FILE = { environments: {} }

module.exports = web3 => {
  const { isLocalNetwork, getNetworkName } = require('./network')(web3)
  
  const ArappFile = {
    async fileName() {
      return (await isLocalNetwork()) ? LOCAL_FILE_NAME : FILE_NAME
    },

    async filePath() {
      return path.resolve(await ArappFile.fileName())
    },

    async file() {
      const filePath = await ArappFile.filePath()
      const file = fs.existsSync(filePath) ? require(filePath) : DEFAULT_ARAPP_FILE
      if (!file.environments) file.environments = {}
      return file
    },

    async deployedAddresses() {
      const network = await getNetworkName()
      const file = await ArappFile.file()
      return file.environments[network] || {}
    },

    async write(appName, address, contractName, registry) {
      const network = await getNetworkName()
      const data = await ArappFile.file()
      data.path = `contracts/${contractName}.sol`
      if (data.environments === undefined) data.environments = {}
      data.environments[network] = { appName, address, network, registry }
      fs.writeFileSync(await ArappFile.filePath(), JSON.stringify(data, null, 2))
    }
  }

  return ArappFile
}
