const { hash: namehash } = require('eth-ens-namehash')
const { APP_IDS } = require('@aragon/templates-shared/helpers/apps')
const { randomId } = require('@aragon/templates-shared/helpers/aragonId')
const { getEventArgument } = require('@aragon/test-helpers/events')
const { deployedAddresses } = require('@aragon/templates-shared/lib/arapp-file')(web3)
const { assertRole, assertMissingRole } = require('@aragon/templates-shared/helpers/assertRole')(web3)
const decodeEvents = require('@aragon/templates-shared/helpers/decodeEvents')
const assertRevert = require('@aragon/templates-shared/helpers/assertRevert')(web3)

const ReputationTemplate = artifacts.require('ReputationTemplate')

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

contract('Reputation', ([_, deployer, holder1, holder2, holder3]) => {
  let daoID, template, dao, acl, receipt
  let voting, tokenManager, token, finance, agent

  const HOLDERS = [holder1, holder2, holder3]
  const STAKES = [1e18, 2e18, 3e18]

  before('fetch reputation template', async () => {
    template = ReputationTemplate.at((await deployedAddresses()).address)
  })

  describe('newToken', async () => {
    before('create token', async () => {
      const tokenReceipt = await template.newToken()
      token = MiniMeToken.at(getEventArgument(tokenReceipt, 'DeployToken', 'token'))
    })

    it('creates a new token', async () => {
      assert.equal(await token.name(), 'Reputation Token')
      assert.equal(await token.symbol(), 'REP')
      assert.equal((await token.decimals()).toString(), 18)
    })
  })

  describe('newInstance', async () => {
    context('when there was no token created before', () => {
      it('reverts', async () => {
        await assertRevert(template.newInstance.request('id', HOLDERS, STAKES, { from: deployer }), 'REPUTATION_MISSING_TOKEN_CACHE')
      })
    })

    context('when there was a token created', () => {
      before('create token', async () => {
        const tokenReceipt = await template.newToken({ from: deployer })
        token = MiniMeToken.at(getEventArgument(tokenReceipt, 'DeployToken', 'token'))
      })

      context('when the given holders and stakes length do not match', () => {
        it('reverts', async () => {
          await assertRevert(template.newInstance.request('id', [], STAKES, { from: deployer }), 'REPUTATION_BAD_HOLDERS_STAKES_LEN')
          await assertRevert(template.newInstance.request('id', HOLDERS, [], { from: deployer }), 'REPUTATION_BAD_HOLDERS_STAKES_LEN')
        })
      })

      context('when the given holders and stakes length match', () => {
        before('create reputation entity', async () => {
          daoID = randomId()
          receipt = await template.newInstance(daoID, HOLDERS, STAKES, { from: deployer })
          dao = Kernel.at(getEventArgument(receipt, 'DeployDao', 'dao'))
          acl = ACL.at(await dao.acl())
        })

        before('load apps', async () => {
          const events = decodeEvents(receipt.receipt, Kernel.abi, 'NewAppProxy')
          const agentEvents = events.filter(e => e.args.appId === APP_IDS.agent)
          const votingEvents = events.filter(e => e.args.appId === APP_IDS.voting)
          const financeEvents = events.filter(e => e.args.appId === APP_IDS.finance)
          const tokenManagerEvents = events.filter(e => e.args.appId === APP_IDS['token-manager'])

          assert.equal(agentEvents.length, 1, 'should have deployed 1 agent app')
          assert.equal(votingEvents.length, 1, 'should have deployed 1 voting app')
          assert.equal(financeEvents.length, 1, 'should have deployed 1 finance app')
          assert.equal(tokenManagerEvents.length, 1, 'should have deployed 1 token manager app')

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

        it('mints requested amounts for the holders', async () => {
          assert.equal((await token.totalSupply()).toString(), STAKES.reduce((a, b) => a + b))
          for (const holder of HOLDERS) assert.equal((await token.balanceOf(holder)).toString(), STAKES[HOLDERS.indexOf(holder)])
        })

        it('should have voting app correctly setup', async () => {
          assert.isTrue(await voting.hasInitialized(), 'voting not initialized')
          assert.equal((await voting.supportRequiredPct()).toString(), 50e16)
          assert.equal((await voting.minAcceptQuorumPct()).toString(), 20e16)
          assert.equal((await voting.voteTime()).toString(), 60 * 60 * 24 * 7)

          await assertRole(acl, voting, voting, 'CREATE_VOTES_ROLE', tokenManager)
          await assertRole(acl, voting, voting, 'MODIFY_QUORUM_ROLE')
          await assertRole(acl, voting, voting, 'MODIFY_SUPPORT_ROLE')
        })

        it('should have token manager app correctly setup', async () => {
          assert.isTrue(await tokenManager.hasInitialized(), 'token manager not initialized')
          assert.equal(await tokenManager.token(), token.address)

          await assertRole(acl, tokenManager, voting, 'MINT_ROLE')
          await assertRole(acl, tokenManager, voting, 'BURN_ROLE')

          await assertMissingRole(acl, tokenManager, 'ISSUE_ROLE')
          await assertMissingRole(acl, tokenManager, 'ASSIGN_ROLE')
          await assertMissingRole(acl, tokenManager, 'REVOKE_VESTINGS_ROLE')
        })

        it('should have finance app correctly setup', async () => {
          assert.isTrue(await finance.hasInitialized(), 'finance not initialized')
          assert.equal(web3.toChecksumAddress(await finance.vault()), agent.address)

          await assertRole(acl, finance, voting, 'CREATE_PAYMENTS_ROLE')
          await assertRole(acl, finance, voting, 'EXECUTE_PAYMENTS_ROLE')
          await assertRole(acl, finance, voting, 'MANAGE_PAYMENTS_ROLE')

          await assertMissingRole(acl, finance, 'CHANGE_PERIOD_ROLE')
          await assertMissingRole(acl, finance, 'CHANGE_BUDGETS_ROLE')
        })

        it('should have agent app correctly setup', async () => {
          assert.isTrue(await agent.hasInitialized(), 'agent not initialized')
          assert.equal(await agent.designatedSigner(), ZERO_ADDRESS)

          assert.equal(await dao.recoveryVaultAppId(), APP_IDS.agent, 'agent app is not being used as the vault app of the DAO')
          assert.equal(web3.toChecksumAddress(await dao.getRecoveryVault()), agent.address, 'agent app is not being used as the vault app of the DAO')

          await assertRole(acl, agent, voting, 'EXECUTE_ROLE')
          await assertRole(acl, agent, voting, 'RUN_SCRIPT_ROLE')
          await assertRole(acl, agent, voting, 'TRANSFER_ROLE', finance)

          await assertMissingRole(acl, agent, 'DESIGNATE_SIGNER_ROLE')
          await assertMissingRole(acl, agent, 'ADD_PRESIGNED_HASH_ROLE')
        })

        it('sets up DAO and ACL permissions correctly', async () => {
          await assertRole(acl, dao, voting, 'APP_MANAGER_ROLE')
          await assertRole(acl, acl, voting, 'CREATE_PERMISSIONS_ROLE')
        })

        it('sets up EVM scripts registry permissions correctly', async () => {
          const reg = await EVMScriptRegistry.at(await acl.getEVMScriptRegistry())
          await assertRole(acl, reg, voting, 'REGISTRY_ADD_EXECUTOR_ROLE')
          await assertRole(acl, reg, voting, 'REGISTRY_MANAGER_ROLE')
        })
      })
    })
  })
})
