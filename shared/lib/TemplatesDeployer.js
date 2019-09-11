const { hash: namehash } = require('eth-ens-namehash')

const logDeploy = require('@aragon/os/scripts/helpers/deploy-logger')
const deployAPM = require('@aragon/os/scripts/deploy-apm')
const deployENS = require('@aragon/os/scripts/deploy-test-ens')
const deployAragonID = require('@aragon/id/scripts/deploy-beta-aragonid')
const deployDAOFactory = require('@aragon/os/scripts/deploy-daofactory')

module.exports = class TemplateDeployer {
  constructor(web3, artifacts, owner, options = { verbose: false }) {
    this.web3 = web3
    this.artifacts = artifacts
    this.owner = owner
    this.options = { ...options }
  }

  async deploy(templateName, contractName) {
    await this.fetchOrDeployDependencies()
    const template = await this.deployTemplate(contractName)
    await this.registerDeploy(templateName, template)
    return template
  }

  async deployTemplate(contractName) {
    const Template = this.artifacts.require(contractName)
    const template = await Template.new(this.daoFactory.address, this.ens.address, this.miniMeFactory.address, this.aragonID.address)
    await logDeploy(template)
    return template
  }

  async fetchOrDeployDependencies() {
    await this._fetchOrDeployENS()
    await this._fetchOrDeployAPM()
    await this._fetchOrDeployAragonID()
    await this._fetchOrDeployDAOFactory()
    await this._fetchOrDeployMiniMeFactory()
    await this._checkAppsDeployment()
  }

  async registerDeploy(templateName, template) {
    if ((await this.isLocal()) && !(await this._isPackageRegistered(templateName))) {
      await this._registerPackage(templateName, template)
    }
    await this._writeArappFile(templateName, template)
  }

  async _checkAppsDeployment() {
    for (const { name, contractName } of this.options.apps) {
      if (await this._isPackageRegistered(name)) {
        this.log(`Using registered ${name} app`)
      } else if (await this.isLocal()) {
        await this._registerApp(name, contractName)
      } else {
        this.log(`No ${name} app registered`)
      }
    }
  }

  async _fetchOrDeployENS() {
    const ENS = this.artifacts.require('ENS')
    if (this.options.ens) {
      this.log(`Using provided ENS: ${this.options.ens}`)
      this.ens = ENS.at(this.options.ens)
    } else if (await this.arappENS()) {
      const ensAddress = await this.arappENS()
      this.log(`Using ENS from arapp json file: ${ensAddress}`)
      this.ens = ENS.at(ensAddress)
    } else if (await this.isLocal()) {
      const { ens } = await deployENS(null, { web3: this.web3, artifacts: this.artifacts, owner: this.owner, verbose: this.verbose })
      this.log('Deployed ENS:', ens.address)
      this.ens = ens
    } else {
      this.error('Please provide an ENS instance, aborting.')
    }
  }

  async _fetchOrDeployAPM() {
    const APM = this.artifacts.require('APMRegistry')
    if (this.options.apm) {
      this.log(`Using provided APM: ${this.options.apm}`)
      this.apm = APM.at(this.options.apm)
    } else {
      if (await this._isAPMRegistered()) {
        const apmAddress = await this._fetchRegisteredAPM()
        this.log(`Using APM registered at aragonpm.eth: ${apmAddress}`)
        this.apm = APM.at(apmAddress)
      } else if (await this.isLocal()) {
        await deployAPM(null, { artifacts: this.artifacts, web3: this.web3, owner: this.owner, ensAddress: this.ens.address, verbose: this.verbose })
        const apmAddress = await this._fetchRegisteredAPM()
        if (!apmAddress) this.error('Local APM deployment failed, aborting.')
        this.log('Deployed APM:', apmAddress)
        this.apm = APM.at(apmAddress)
      } else {
        this.error('Please provide an APM instance or make sure there is one registered under "aragonpm.eth", aborting.')
      }
    }
  }

  async _fetchOrDeployAragonID() {
    const FIFSResolvingRegistrar = this.artifacts.require('FIFSResolvingRegistrar')
    if (this.options.aragonID) {
      this.log(`Using provided aragonID: ${this.options.aragonID}`)
      this.aragonID = FIFSResolvingRegistrar.at(this.options.aragonID)
    } else {
      if (await this._isAragonIdRegistered()) {
        const aragonIDAddress = await this._fetchRegisteredAragonID()
        this.log(`Using aragonID registered at aragonid.eth: ${aragonIDAddress}`)
        this.aragonID = FIFSResolvingRegistrar.at(aragonIDAddress)
      } else if (await this.isLocal()) {
        await deployAragonID(null, { artifacts: this.artifacts, web3: this.web3, owner: this.owner, ensAddress: this.ens.address, verbose: this.verbose })
        const aragonIDAddress = await this._fetchRegisteredAragonID()
        if (!aragonIDAddress) this.error('Local aragon ID deployment failed, aborting.')
        this.log('Deployed aragonID:', aragonIDAddress)
        this.aragonID = FIFSResolvingRegistrar.at(aragonIDAddress)
      } else {
        this.error('Please provide an aragon ID instance or make sure there is one registered under "aragonid.eth", aborting.')
      }
    }
  }

  async _fetchOrDeployDAOFactory() {
    const DAOFactory = this.artifacts.require('DAOFactory')
    if (this.options.daoFactory) {
      this.log(`Using provided DAOFactory: ${this.options.daoFactory}`)
      this.daoFactory = DAOFactory.at(this.options.daoFactory)
    } else {
      const { daoFactory } = await deployDAOFactory(null, { artifacts: this.artifacts, owner: this.owner, verbose: this.verbose })
      this.log('Deployed DAOFactory:', daoFactory.address)
      this.daoFactory = daoFactory
    }
  }

  async _fetchOrDeployMiniMeFactory() {
    const MiniMeTokenFactory = this.artifacts.require('MiniMeTokenFactory')
    if (this.options.miniMeFactory) {
      this.log(`Using provided MiniMeTokenFactory: ${this.options.miniMeFactory}`)
      this.miniMeFactory = MiniMeTokenFactory.at(this.options.miniMeFactory)
    } else {
      this.miniMeFactory = await MiniMeTokenFactory.new()
      this.log('Deployed MiniMeTokenFactory:', this.miniMeFactory.address)
    }
  }

  async _fetchRegisteredAPM() {
    const aragonPMHash = namehash('aragonpm.eth')
    const PublicResolver = this.artifacts.require('PublicResolver')
    const resolver = PublicResolver.at(await this.ens.resolver(aragonPMHash))
    return resolver.addr(aragonPMHash)
  }

  async _fetchRegisteredAragonID() {
    const aragonIDHash = namehash('aragonid.eth')
    return this.ens.owner(aragonIDHash)
  }

  async _registerApp(name, contractName) {
    const app = await this.artifacts.require(contractName).new()
    return this._registerPackage(name, app)
  }

  async _registerPackage(name, instance) {
    if (this.options.register) {
      this.log(`Registering package for ${instance.constructor.contractName} as "${name}.aragonpm.eth"`)
      return this.apm.newRepoWithVersion(name, this.owner, [1, 0, 0], instance.address, '')
    }
  }

  async _isAPMRegistered() {
    return this._isRepoRegistered(namehash('aragonpm.eth'))
  }

  async _isAragonIdRegistered() {
    return this._isRepoRegistered(namehash('aragonid.eth'))
  }

  async _isPackageRegistered(name) {
    return this._isRepoRegistered(namehash(`${name}.aragonpm.eth`))
  }

  async _isRepoRegistered(hash) {
    const owner = await this.ens.owner(hash)
    return owner !== '0x0000000000000000000000000000000000000000' && owner !== '0x'
  }

  async _writeArappFile(templateName, template) {
    const { constructor: { contractName } } = template
    await this.arapp.write(templateName, contractName, this.ens.address)
    this.log(`Template addresses saved to ${await this.arapp.filePath()}`)
  }

  async arappENS() {
    const environment = await this.arapp.getDeployedData()
    return environment.registry
  }

  async isLocal() {
    const { isLocalNetwork } = require('./network')(this.web3)
    return isLocalNetwork()
  }

  get arapp() {
    return require('./arapp-file')(this.web3)
  }

  get verbose() {
    return this.options.verbose
  }

  log(...args) {
    if (this.verbose) console.log(...args)
  }

  error(message) {
    throw new Error(message)
  }
}