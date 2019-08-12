const TemplatesDeployer = require('../lib/TemplatesDeployer')
const { APPS } = require('../helpers/apps')
const getAccounts = require('@aragon/os/scripts/helpers/get-accounts')

const errorOut = message => {
  console.error(message)
  throw new Error(message)
}

module.exports = async function deployTemplate(web3, artifacts, templateName, contractName, apps = APPS) {
  let { ens, owner, verbose } = require('yargs')
    .option('e', { alias: 'ens', describe: 'ENS address', type: 'string' })
    .option('o', { alias: 'owner', describe: 'Sender address. Will use first address if no one is given', type: 'string' })
    .option('v', { alias: 'verbose', describe: 'Verbose mode', type: 'boolean', default: false })
    .help('help')
    .parse()

  if (!web3) errorOut('Missing "web3" object. This script must be run with a "web3" object globally defined, for example through "truffle exec".')
  if (!artifacts) errorOut('Missing "artifacts" object. This script must be run with an "artifacts" object globally defined, for example through "truffle exec".')
  if (!owner) owner = (await getAccounts(web3))[0]
  if (!owner) errorOut('Missing sender address. Please specify one using "--owner" or make sure your web3 instance has one loaded.')
  if (!templateName) errorOut('Missing template id.')
  if (!contractName) errorOut('Missing template contract name.')

  const deployer = new TemplatesDeployer(web3, artifacts, owner, { apps, ens, verbose })
  return deployer.deploy(templateName, contractName)
}
