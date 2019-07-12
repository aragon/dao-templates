const deployTemplate = require('@aragon/templates-shared/scripts/deploy-template')

const TEMPLATE_ID = 'trust-template'
const CONTRACT_NAME = 'TrustTemplate'

module.exports = callback => {
  deployTemplate(web3, artifacts, TEMPLATE_ID, CONTRACT_NAME)
    .then(callback)
    .catch(callback)
}
