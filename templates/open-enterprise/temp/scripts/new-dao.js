module.exports = async function newDao({
  artifacts,
  callback,
  settings,
  web3,
}) {
  const {
    allocationsPeriod,
    dotVotingSettings,
    financePeriod,
    id,
    members,
    stakes,
    token,
    useDiscussions,
    votingSettings,
  } = settings

  const { getEventArgument } = require('@aragon/test-helpers/events')
  const { getTemplateAddress } = require('../lib/ens')(web3, artifacts)
  const OpenEnterpriseTemplate = artifacts.require('OpenEnterpriseTemplate')
  const Kernel = artifacts.require('Kernel')

  try {
    const template = OpenEnterpriseTemplate.at(await getTemplateAddress())

    const baseDAO = await template.newTokenAndInstance(
      token.name,
      token.symbol,
      id,
      members,
      stakes,
      votingSettings,
      0,
      { from: members[0] }
    )

    const dao = Kernel.at(getEventArgument(baseDAO, 'DeployDao', 'dao'))
    const baseOpenEnterprise = await template.newOpenEnterprise(
      dotVotingSettings,
      0,
      false,
      { from: members[0] }
    )

    console.log('🤓 Template found at:', template.address)
    console.log(
      '🚀 Created new dao at address:',
      dao.address,
      '\n⛽️ Total gas cost for creation:',
      baseDAO.receipt.gasUsed + baseOpenEnterprise.receipt.gasUsed, 'gas',
      '\n🌐 You can access it at:',
      `http://localhost:8080/ipfs/QmVptozeYf3XxqHfvMjofCkZsYSqi6YuvHFLMc83SECbNw/#/${id}`
    )
    callback()
  } catch (e) {
    callback(e)
  }
}
