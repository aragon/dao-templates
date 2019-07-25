const deployTemplate = require('@aragon/templates-shared/scripts/deploy-template')

const TEMPLATE_NAME = 'bare-template'
const CONTRACT_NAME = 'BareTemplate'

module.exports = callback => {
  deployTemplate(web3, artifacts, TEMPLATE_NAME, CONTRACT_NAME)
    .then(template => {
      console.log(template.address)
      callback()
    })
    .catch(callback)
}
