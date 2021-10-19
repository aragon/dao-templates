const fs = require('fs')
const path = require('path')

const FILE_NAME = 'arapp.json'
const LOCAL_FILE_NAME = 'arapp_local.json'
const DEFAULT_ARAPP_FILE = { environments: {} }

module.exports = web3 => {
  const { isLocalNetwork, getNetworkName } = require('./network')(web3)

  async function arappFileName() {
    return (await isLocalNetwork()) ? LOCAL_FILE_NAME : FILE_NAME
  }

  async function arappFilePath() {
    return path.resolve(await arappFileName())
  }

  async function read() {
    const filePath = await arappFilePath()
    const file = fs.existsSync(filePath) ? require(filePath) : DEFAULT_ARAPP_FILE
    if (!file.environments) file.environments = {}
    return file
  }

  async function getDeployedData() {
    const network = await getNetworkName()
    const file = await read()
    return file.environments[network] || {}
  }

  async function write(appName, contractName, registry) {
    const network = await getNetworkName()
    const data = await read()
    data.path = `contracts/${contractName}.sol`
    if (data.environments === undefined) data.environments = {}
    const wsRPC = `wss://${network}.eth.aragon.network/ws`
    data.environments[network] = { appName: `${appName}.aragonpm.eth`, network, registry, wsRPC }
    fs.writeFileSync(await arappFilePath(), JSON.stringify(data, null, 2))
  }

  return {
    read,
    write,
    getDeployedData,
    fileName: arappFileName,
    filePath: arappFilePath,
  }
}