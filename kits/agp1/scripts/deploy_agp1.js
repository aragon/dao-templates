const namehash = require('eth-ens-namehash').hash

const getAccounts = require('@aragon/os/scripts/helpers/get-accounts')
const deployDAOFactory = require('@aragon/os/scripts/deploy-daofactory.js')
const logDeploy = require('@aragon/os/scripts/helpers/deploy-logger')

const getEventResult = (receipt, event, param) => receipt.logs.filter(l => l.event == event)[0].args[param]
const getAppProxy = (receipt, id, index=0) => receipt.logs.filter(l => l.event == 'InstalledApp' && l.args.appId == id)[index].args.appProxy

const apps = ['finance', 'vault', 'voting']
const appIds = apps.map(app => namehash(require(`@aragon/apps-${app}/arapp`).environments.default.appName))

const globalArtifacts = this.artifacts // Not injected unless called directly via truffle
const globalWeb3 = this.web3 // Not injected unless called directly via truffle
const defaultOwner = process.env.OWNER
const defaultENSAddress = process.env.ENS
const defaultDAOFactoryAddress = process.env.DAO_FACTORY
const defaultMinimeTokenAddress = process.env.MINIME_TOKEN

module.exports = async (
  truffleExecCallback,
  {
    artifacts = globalArtifacts,
    web3 = globalWeb3,
    owner = defaultOwner,
    ensAddress = defaultENSAddress,
    daoFactoryAddress = defaultDAOFactoryAddress,
    minimeTokenAddress = defaultMinimeTokenAddress,
    verbose = true
  } = {}
) => {
  const kitName = 'AGP1Kit'

  const log = (...args) => {
    if (verbose) { console.log(...args) }
  }

  const errorOut = (msg) => {
    console.error(msg)
    throw new Error(msg)
  }

  if (!owner) {
    const accounts = await getAccounts(web3)
    owner = accounts[0]
    log('OWNER env variable not found, setting APM owner to the provider\'s first account')
  }

  log(`${kitName} with ENS ${ensAddress}, owner ${owner}`)

  const TokenFactoryWrapper = artifacts.require('TokenFactoryWrapper')
  const DAOFactory = artifacts.require('DAOFactory')
  const ENS = artifacts.require('ENS')

  if (!ensAddress) {
    errorOut('ENS environment variable not passed, aborting.')
  }
  log('Using ENS', ensAddress)
  const ens = ENS.at(ensAddress)

  if (!daoFactoryAddress) {
    const daoFactory = (await deployDAOFactory(null, { artifacts, verbose: false })).daoFactory
    daoFactoryAddress = daoFactory.address
  }
  log(`Using DAOFactory: ${daoFactoryAddress}`)

  if (!minimeTokenAddress) {
    const tokenFac = await TokenFactoryWrapper.new()
    log('Deployed Token Factory:', tokenFac.address)
    const tokenReceipt = await tokenFac.newToken('ANT', 'ANT', { from: owner })
    minimeTokenAddress = getEventResult(tokenReceipt, 'NewToken', 'token')
    const minimeTokenController = getEventResult(tokenReceipt, 'NewToken', 'controller')
    log(`Using MiniMeToken: ${minimeTokenAddress} controlled by ${minimeTokenController}`)
  } else {
    log(`Using MiniMeToken: ${minimeTokenAddress}`)
  }

  const apmAddress = await artifacts.require('PublicResolver').at(await ens.resolver(namehash('aragonpm.eth'))).addr(namehash('aragonpm.eth'))
  if (!apmAddress) {
    errorOut('No APM found for ENS, aborting.')
  }
  log('APM', apmAddress);
  const apm = artifacts.require('APMRegistry').at(apmAddress)

  for (let i = 0; i < apps.length; i++) {
    if (await ens.owner(appIds[i]) == '0x0000000000000000000000000000000000000000') {
      errorOut(`Missing app ${apps[i]}, aborting.`)
    }
  }

  const agp1Kit = await artifacts.require(kitName).new(daoFactoryAddress, ensAddress)
  log('Kit address:', agp1Kit.address)
  await logDeploy(agp1Kit)

  const agp1Receipt = await agp1Kit.newInstance(minimeTokenAddress, owner)
  log('Gas used:', agp1Receipt.receipt.cumulativeGasUsed)
  const agp1Address = getEventResult(agp1Receipt, 'DeployInstance', 'dao')
  log('AGP1 DAO address: ', agp1Address)

  // generated apps
  const financeAddress = getAppProxy(agp1Receipt, appIds[0])
  const vaultAddress = getAppProxy(agp1Receipt, appIds[1])
  const votingAddress = getAppProxy(agp1Receipt, appIds[2])
  const metaTrackVotingAddress = getAppProxy(agp1Receipt, appIds[2], 1)

  log('Finance: ', financeAddress)
  log('Vault: ', vaultAddress)
  log('Voting: ', votingAddress)
  log('Meta Track Voting: ', metaTrackVotingAddress)

  if (typeof truffleExecCallback === 'function') {
    // Called directly via `truffle exec`
    truffleExecCallback()
  } else {
    return {
      agp1Address,
      minimeTokenAddress,
      financeAddress,
      vaultAddress,
      votingAddress,
      metaTrackVotingAddress
    }
  }
}
