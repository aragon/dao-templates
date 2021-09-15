const { hash: namehash } = require('eth-ens-namehash')

module.exports = (web3, artifacts) => {
  const { getDeployedData } = require('./arapp-file')(web3)

  const getENS = async () => {
    const { registry } = await getDeployedData()
    return artifacts.require('ENS').at(registry)
  }

  const getAPM = async () => {
    const ens = await getENS()
    const apmAddress = await ens.resolver(namehash('open.aragonpm.eth'))
    return artifacts.require('PublicResolver').at(apmAddress)
  }

  const getTemplateAddress = async () => {
    const apm = await getAPM()
    const { appName } = await getDeployedData()
    const repoAddress = await apm.addr(namehash(appName))
    const repo = artifacts.require('Repo').at(repoAddress)
    return (await repo.getLatest())[1]
  }

  return {
    getENS,
    getAPM,
    getTemplateAddress
  }
}