const deployTemplate = require('@aragon/templates-shared/scripts/deploy-template')

const TEMPLATE_NAME = 'membership-template'
const CONTRACT_NAME = 'MembershipTemplate'

module.exports = callback => {
  deployTemplate(web3, artifacts, TEMPLATE_NAME, CONTRACT_NAME)
    .then(template => {
      console.log(template.address)
      callback()
    })
    .catch(callback)
}
