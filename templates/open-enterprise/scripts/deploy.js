/* global artifacts, web3 */
// const deployTemplate = require('@aragon/templates-shared/scripts/deploy-template')
const deployTemplate = require('../temp/scripts/deploy-template')

const TEMPLATE_NAME = 'open-enterprise-template'
const CONTRACT_NAME = 'OpenEnterpriseTemplate'

module.exports = callback => {
  deployTemplate(web3, artifacts, TEMPLATE_NAME, CONTRACT_NAME)
    .then(template => {
      console.log(
        'Open Enterprise template deployed at address\n',
        template.address
      )
      callback()
    })
    .catch(callback)
}
