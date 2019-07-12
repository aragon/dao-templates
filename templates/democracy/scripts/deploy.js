const deployTemplate = require('@aragon/templates-shared/scripts/deploy-template')

const TEMPLATE_ID = 'democracy-template'
const CONTRACT_NAME = 'DemocracyTemplate'

module.exports = callback => {
  deployTemplate(web3, artifacts, TEMPLATE_ID, CONTRACT_NAME)
    .then(callback)
    .catch(callback)
}
