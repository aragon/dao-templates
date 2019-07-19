const deployTemplate = require('@aragon/templates-shared/scripts/deploy-template')

const TEMPLATE_ID = 'multisig-template'
const CONTRACT_NAME = 'MultisigTemplate'

module.exports = callback => {
  deployTemplate(web3, artifacts, TEMPLATE_ID, CONTRACT_NAME)
    .then(callback)
    .catch(callback)
}
