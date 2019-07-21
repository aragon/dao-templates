const { hash: namehash } = require('eth-ens-namehash')
const { APP_IDS } = require('@aragon/templates-shared/helpers/apps')
const { randomId } = require('@aragon/templates-shared/helpers/aragonId')
const { getEventArgument } = require('@aragon/test-helpers/events')
const { deployedAddresses } = require('@aragon/templates-shared/lib/arapp-file')(web3)
const assertRole = require('@aragon/templates-shared/helpers/assertRole')(web3)
const decodeEvents = require('@aragon/templates-shared/helpers/decodeEvents')
const assertRevert = require('@aragon/templates-shared/helpers/assertRevert')(web3)

const CompanyTemplate = artifacts.require('CompanyTemplate')

const ENS = artifacts.require('ENS')
const ACL = artifacts.require('ACL')
const Kernel = artifacts.require('Kernel')
const Agent = artifacts.require('Agent')
const Voting = artifacts.require('Voting')
const Finance = artifacts.require('Finance')
const TokenManager = artifacts.require('TokenManager')
const MiniMeToken = artifacts.require('MiniMeToken')
const PublicResolver = artifacts.require('PublicResolver')
const EVMScriptRegistry = artifacts.require('EVMScriptRegistry')

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

contract('Company', ([_, deployer, holder1, holder2, holder3]) => {
  let daoID, companyTemplate, dao, acl, receipt
  let voting, tokenManager, token, finance, agent

  const HOLDERS = [holder1, holder2, holder3]
  const STAKES = HOLDERS.map(() => 1e18)

  before('fetch company template', async () => {
    companyTemplate = CompanyTemplate.at((await deployedAddresses()).address)
  })

  context('when the creation fails', () => {
    it('reverts when the given holders and stakes length do not match', async () => {
      await assertRevert(companyTemplate.newTokenAndInstance.request('id', [], STAKES), 'COMPANY_INVALID_HOLDERS_STAKES_LEN')
      await assertRevert(companyTemplate.newTokenAndInstance.request('id', HOLDERS, []), 'COMPANY_INVALID_HOLDERS_STAKES_LEN')
    })

    it('reverts when there was no token cached', async () => {
      await assertRevert(companyTemplate.newInstance.request('id', HOLDERS, STAKES), 'COMPANY_MISSING_TOKEN_CACHE')
    })
  })

  context('when the creation succeeds', () => {
    before('create company entity', async () => {
      daoID = randomId()
      const tokenReceipt = await companyTemplate.newToken({ from: deployer })
      receipt = await companyTemplate.newInstance(daoID, HOLDERS, STAKES, { from: deployer })

      dao = Kernel.at(getEventArgument(receipt, 'DeployDao', 'dao'))
      token = MiniMeToken.at(getEventArgument(tokenReceipt, 'DeployToken', 'token'))
      acl = ACL.at(await dao.acl())
    })

    before('load apps', async () => {
      const events = decodeEvents(receipt.receipt, Kernel.abi, 'NewAppProxy')
      const agentEvents = events.filter(e => e.args.appId === APP_IDS.agent)
      const votingEvents = events.filter(e => e.args.appId === APP_IDS.voting)
      const financeEvents = events.filter(e => e.args.appId === APP_IDS.finance)
      const tokenManagerEvents = events.filter(e => e.args.appId === APP_IDS['token-manager'])

      assert.equal(agentEvents.length, 1, 'should have deployed 1 agent app')
      assert.equal(votingEvents.length, 1, 'should have deployed 1 voting apps')
      assert.equal(financeEvents.length, 1, 'should have deployed 1 finance app')
      assert.equal(tokenManagerEvents.length, 1, 'should have deployed 1 token manager apps')

      agent = Agent.at(agentEvents[0].args.proxy)
      voting = Voting.at(votingEvents[0].args.proxy)
      finance = Finance.at(financeEvents[0].args.proxy)
      tokenManager = TokenManager.at(tokenManagerEvents[0].args.proxy)
    })

    it('registers a new DAO on ENS', async () => {
      const ens = ENS.at((await deployedAddresses()).registry)
      const aragonIdNameHash = namehash(`${daoID}.aragonid.eth`)
      const resolvedAddress = await PublicResolver.at(await ens.resolver(aragonIdNameHash)).addr(aragonIdNameHash)
      assert.equal(resolvedAddress, dao.address, 'aragonId ENS name does not match')
    })

    it('should have voting app correctly setup', async () => {
      assert.isTrue(await voting.hasInitialized(), 'voting not initialized')
      assert.equal((await voting.supportRequiredPct()).toString(), 50e16)
      assert.equal((await voting.minAcceptQuorumPct()).toString(), 5e16)
      assert.equal((await voting.voteTime()).toString(), 60 * 60 * 24 * 7)

      await assertRole(acl, voting, voting, 'CREATE_VOTES_ROLE', tokenManager)
      await assertRole(acl, voting, voting, 'MODIFY_QUORUM_ROLE')
      await assertRole(acl, voting, voting, 'MODIFY_SUPPORT_ROLE')
    })

    it('should have token correctly setup', async () => {
      assert.equal(await token.name(), 'Share Token')
      assert.equal(await token.symbol(), 'SHARE')
      assert.equal((await token.decimals()).toString(), 18)
      assert.equal((await token.totalSupply()).toString(), STAKES.reduce((a, b) => a + b))

      for (const holder of HOLDERS) assert.equal((await token.balanceOf(holder)).toString(), STAKES[HOLDERS.indexOf(holder)])
    })

    it('should have token manager app correctly setup', async () => {
      assert.isTrue(await tokenManager.hasInitialized(), 'token manager not initialized')
      assert.equal(await tokenManager.token(), token.address)

      await assertRole(acl, tokenManager, voting, 'MINT_ROLE')
      await assertRole(acl, tokenManager, voting, 'BURN_ROLE')
    })

    it('should have finance app correctly setup', async () => {
      assert.isTrue(await finance.hasInitialized(), 'finance not initialized')
      assert.equal(web3.toChecksumAddress(await finance.vault()), agent.address)

      await assertRole(acl, finance, voting, 'CREATE_PAYMENTS_ROLE')
      await assertRole(acl, finance, voting, 'EXECUTE_PAYMENTS_ROLE')
      await assertRole(acl, finance, voting, 'MANAGE_PAYMENTS_ROLE')
    })

    it('should have agent app correctly setup', async () => {
      assert.isTrue(await agent.hasInitialized(), 'agent not initialized')
      assert.equal(await agent.designatedSigner(), ZERO_ADDRESS)

      await assertRole(acl, agent, voting, 'EXECUTE_ROLE')
      await assertRole(acl, agent, voting, 'RUN_SCRIPT_ROLE')
      await assertRole(acl, agent, voting, 'TRANSFER_ROLE', finance)
    })

    it('setup DAO and ACL permissions correctly', async () => {
      await assertRole(acl, dao, voting, 'APP_MANAGER_ROLE')
      await assertRole(acl, acl, voting, 'CREATE_PERMISSIONS_ROLE')
    })

    it('setup EVM scripts registry permissions correctly', async () => {
      const reg = await EVMScriptRegistry.at(await acl.getEVMScriptRegistry())
      await assertRole(acl, reg, voting, 'REGISTRY_ADD_EXECUTOR_ROLE')
      await assertRole(acl, reg, voting, 'REGISTRY_MANAGER_ROLE')
    })
  })
})
