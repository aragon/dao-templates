const logDeploy = require('@aragon/os/scripts/helpers/deploy-logger')
// const deployStandardBounties = require('../scripts/deploy-standardBounties')
const TemplateDeployer = require('./TemplatesDeployer')

module.exports = class OEDeployer extends TemplateDeployer {
  constructor(web3, artifacts, owner, options = { verbose: false }) {
    super(web3, artifacts, owner, options)
  }
  
  async deploy(templateName, contractName) {
    // console.log('deployed!', this.options)
    await this._fetchOrDeployStandardBounties()
    await this.fetchOrDeployDependencies()
    const template = await this.deployTemplate(contractName)
    await this.registerDeploy(templateName, template)
    return template
  }

  async deployTemplate(contractName) {
    const Template = this.artifacts.require(contractName)
    const template = await Template.new([ this.daoFactory.address, this.ens.address, this.miniMeFactory.address, this.aragonID.address, this.standardBounties.address ])
    await logDeploy(template)
    return template
  }

  async _fetchOrDeployStandardBounties() {
    // const standardBounties = this.artifacts.require('StandardBounties')
    if (this.options.standardBounties) {
      this.log(`Using provided StandardBounties: ${this.options.standardBounties}`)
      // this.standardBounties = standardBounties.at(this.options.standardBounties)
      this.standardBounties = { address: this.options.standardBounties }
    // TODO: unimplemented adding the address to arapp.json for now
    // } else if (await this.arappStandardBounties()) {
    //   const standardBountiesAddress = await this.arappStandardBounties()
    //   this.log(`Using StandardBounties from arapp json file: ${standardBountiesAddress}`)
    //   this.standardBounties = standardBounties.at(standardBountiesAddress)
    // TODO: The only option available for now is to provide the standardbounties address in the option
    // } else if (await this.isLocal()) {
    //   const { standardBounties } = await deployStandardBounties(null, { web3: this.web3, artifacts: this.artifacts, owner: this.owner, verbose: this.verbose })
    //   this.standardBounties = standardBounties
    } else {
      this.error('Please provide a StandardBounties instance, aborting.')
    }
  }


}
