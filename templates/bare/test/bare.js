const { APP_IDS } = require('@aragon/templates-shared/helpers/apps')
const { getEventArgument } = require('@aragon/test-helpers/events')
const { deployedAddresses } = require('@aragon/templates-shared/lib/arapp-file')(web3)
const { assertRole } = require('@aragon/templates-shared/helpers/assertRole')(web3)
const decodeEvents = require('@aragon/templates-shared/helpers/decodeEvents')

const ACL = artifacts.require('ACL')
const Kernel = artifacts.require('Kernel')
const Voting = artifacts.require('Voting')
const BareTemplate = artifacts.require('BareTemplate')

contract('Bare', ([_, deployer, tokenAddress, authorized]) => {
  let bareTemplate, dao, acl, voting, CREATE_VOTES_ROLE

  const SUPPORT = 50e16
  const ACCEPTANCE = 20e16
  const VOTING_DURATION = 60

  before('fetch bare template', async () => {
    const { address } = await deployedAddresses()
    bareTemplate = BareTemplate.at(address)
  })

  before('create bare entity', async () => {
    const votingBase = await Voting.new()
    CREATE_VOTES_ROLE = await votingBase.CREATE_VOTES_ROLE()
    const initializeData = votingBase.contract.initialize.getData(tokenAddress, SUPPORT, ACCEPTANCE, VOTING_DURATION)
    const receipt = await bareTemplate.newInstance(APP_IDS.voting, [CREATE_VOTES_ROLE], authorized, initializeData, { from: deployer })

    dao = Kernel.at(getEventArgument(receipt, 'DeployDao', 'dao'))
    acl = ACL.at(await dao.acl())

    const events = decodeEvents(receipt.receipt, Kernel.abi, 'NewAppProxy')
    const votingEvents = events.filter(e => e.args.appId === APP_IDS.voting)
    voting = Voting.at(votingEvents[0].args.proxy)
  })

  it('setup DAO and ACL permissions correctly', async () => {
    await assertRole(acl, dao, { address: deployer }, 'APP_MANAGER_ROLE')
    await assertRole(acl, acl, { address: deployer }, 'CREATE_PERMISSIONS_ROLE')
  })

  it('installs the requested application correctly', async () => {
    assert.isTrue(await voting.hasInitialized(), 'voting not initialized')
    assert.equal((await voting.token()), tokenAddress)
    assert.equal((await voting.voteTime()).toString(), 60)
    assert.equal((await voting.supportRequiredPct()).toString(), 50e16)
    assert.equal((await voting.minAcceptQuorumPct()).toString(), 20e16)

    await assertRole(acl, voting, { address: deployer }, 'CREATE_VOTES_ROLE', { address: authorized })
  })
})
