const { hash: namehash } = require('eth-ens-namehash')
const { APP_IDS } = require('@aragon/templates-shared/helpers/apps')
const { randomId } = require('@aragon/templates-shared/helpers/aragonId')
const { getEventArgument } = require('@aragon/test-helpers/events')
const { deployedAddresses } = require('@aragon/templates-shared/lib/arapp-file')(web3)
const { assertRole, assertMissingRole } = require('@aragon/templates-shared/helpers/assertRole')(web3)
const decodeEvents = require('@aragon/templates-shared/helpers/decodeEvents')
const assertRevert = require('@aragon/templates-shared/helpers/assertRevert')(web3)

const TrustTemplate = artifacts.require('TrustTemplate')

const ENS = artifacts.require('ENS')
const ACL = artifacts.require('ACL')
const Kernel = artifacts.require('Kernel')
const Vault = artifacts.require('Vault')
const Agent = artifacts.require('Agent')
const Voting = artifacts.require('Voting')
const Finance = artifacts.require('Finance')
const TokenManager = artifacts.require('TokenManager')
const MultiSigWallet = artifacts.require('MultiSigWallet')
const MiniMeToken = artifacts.require('MiniMeToken')
const PublicResolver = artifacts.require('PublicResolver')
const EVMScriptRegistry = artifacts.require('EVMScriptRegistry')

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

contract('Trust', ([deployer, beneficiaryKey1, beneficiaryKey2, heir1, heir2, multiSigKey1, multiSigKey2]) => {
  let daoID, trustTemplate, dao, multiSig, acl, prepareReceipt, daoSetupReceipt, multiSigSetupReceipt
  let holdVoting, heirsVoting, holdTokenManager, heirsTokenManager, holdToken, heirsToken, vault, finance, agent

  const HEIRS = [heir1, heir2]
  const HEIRS_STAKE = HEIRS.map(() => 33e18)
  const MULTI_SIG_KEYS = [multiSigKey1, multiSigKey2]
  const BENEFICIARY_KEYS = [beneficiaryKey1, beneficiaryKey2]

  before('fetch trust template', async () => {
    trustTemplate = TrustTemplate.at((await deployedAddresses()).address)
  })

  context('when the setup dao fails', () => {
    before('prepare entity', async () => {
      await trustTemplate.prepareDAO({ from: deployer })
    })

    it('reverts when the given beneficiary keys are not 2', async () => {
      await assertRevert(trustTemplate.setupDAO.request('id', [beneficiaryKey1], HEIRS, HEIRS_STAKE, { from: deployer }), 'TRUST_BAD_BENEFICIARY_KEY_LENGTH')
      await assertRevert(trustTemplate.setupDAO.request('id', [beneficiaryKey1, beneficiaryKey2, heir1], HEIRS, HEIRS_STAKE, { from: deployer }), 'TRUST_BAD_BENEFICIARY_KEY_LENGTH')
    })

    it('reverts when the given heirs do not match', async () => {
      await assertRevert(trustTemplate.setupDAO.request('id', BENEFICIARY_KEYS, HEIRS, [66e18], { from: deployer }), 'TRUST_BAD_HEIRS_LENGTH')
    })

    it('reverts when the given heirs stake do not represent a 66%', async () => {
      await assertRevert(trustTemplate.setupDAO.request('id', BENEFICIARY_KEYS, HEIRS, [1e18, 1e18], { from: deployer }), 'TRUST_INVALID_HEIRS_STAKE')
    })
  })

  context('when the setup multi sig fails', () => {
    before('prepare entity', async () => {
      await trustTemplate.prepareDAO({ from: deployer })
      await trustTemplate.setupDAO(randomId(), BENEFICIARY_KEYS, HEIRS, HEIRS_STAKE, { from: deployer })
    })

    it('reverts when given multi sig keys are not 2', async () => {
      await assertRevert(trustTemplate.setupMultiSig.request([multiSigKey1], { from: deployer }), 'TRUST_BAD_MULTI_SIG_KEYS_LENGTH')
      await assertRevert(trustTemplate.setupMultiSig.request([multiSigKey1, multiSigKey2, heir1], { from: deployer }), 'TRUST_BAD_MULTI_SIG_KEYS_LENGTH')
    })
  })

  context('when the creation succeeds', () => {
    before('create trust entity', async () => {
      daoID = randomId()
      prepareReceipt = await trustTemplate.prepareDAO({ from: deployer })
      daoSetupReceipt = await trustTemplate.setupDAO(daoID, BENEFICIARY_KEYS, HEIRS, HEIRS_STAKE, { from: deployer })
      multiSigSetupReceipt = await trustTemplate.setupMultiSig(MULTI_SIG_KEYS, { from: deployer })

      dao = Kernel.at(getEventArgument(prepareReceipt, 'DeployDao', 'dao'))
      multiSig = MultiSigWallet.at(getEventArgument(multiSigSetupReceipt, 'DeployMultiSig', 'multiSig'))
      acl = ACL.at(await dao.acl())
    })

    before('load apps', async () => {
      const events = decodeEvents(daoSetupReceipt.receipt, Kernel.abi, 'NewAppProxy')
      const votingEvents = events.filter(e => e.args.appId === APP_IDS.voting)
      const tokenManagerEvents = events.filter(e => e.args.appId === APP_IDS['token-manager'])
      const agentEvents = events.filter(e => e.args.appId === APP_IDS.agent)
      const vaultEvents = events.filter(e => e.args.appId === APP_IDS.vault)
      const financeEvents = events.filter(e => e.args.appId === APP_IDS.finance)

      assert.equal(votingEvents.length, 2, 'should have deployed 2 voting apps')
      assert.equal(tokenManagerEvents.length, 2, 'should have deployed 2 token manager apps')
      assert.equal(agentEvents.length, 1, 'should have deployed 1 agent app')
      assert.equal(vaultEvents.length, 1, 'should have deployed 1 vault app')
      assert.equal(financeEvents.length, 1, 'should have deployed 1 finance app')

      holdVoting = Voting.at(votingEvents[0].args.proxy)
      heirsVoting = Voting.at(votingEvents[1].args.proxy)
      holdTokenManager = TokenManager.at(tokenManagerEvents[0].args.proxy)
      heirsTokenManager = TokenManager.at(tokenManagerEvents[1].args.proxy)
      agent = Agent.at(agentEvents[0].args.proxy)
      vault = Vault.at(vaultEvents[0].args.proxy)
      finance = Finance.at(financeEvents[0].args.proxy)
      holdToken = MiniMeToken.at(await holdVoting.token())
      heirsToken = MiniMeToken.at(await heirsVoting.token())
    })

    it('costs ~6e6 each tx', async () => {
      assert.isAtMost(prepareReceipt.receipt.gasUsed, 5e6, 'prepare script should cost almost 5e6 gas')
      assert.isAtMost(daoSetupReceipt.receipt.gasUsed, 6e6, 'prepare script should cost almost 6e6 gas')
      assert.isAtMost(multiSigSetupReceipt.receipt.gasUsed, 2e6, 'prepare script should cost almost 2e6 gas')
    })

    it('registers a new DAO on ENS', async () => {
      const ens = ENS.at((await deployedAddresses()).registry)
      const aragonIdNameHash = namehash(`${daoID}.aragonid.eth`)
      const resolvedAddress = await PublicResolver.at(await ens.resolver(aragonIdNameHash)).addr(aragonIdNameHash)
      assert.equal(resolvedAddress, dao.address, 'aragonId ENS name does not match')
    })

    it('should have setup a multi sig wallet correctly', async () => {
      assert.equal((await multiSig.required()).toString(), 2, 'multi sig should have 2 required confirmations')

      const owners = (await multiSig.getOwners())
      assert.equal(owners.length, 3, 'multi sig should have 3 owners')
      assert.equal(owners[0], multiSigKey1, 'multi sig does not include multiSigKey1 as one of their owners')
      assert.equal(owners[1], multiSigKey2, 'multi sig does not include multiSigKey2 as one of their owners')
      assert.equal(web3.toChecksumAddress(owners[2]), agent.address, 'multi sig does not include the agent as one of their owners')
    })

    it('should have hold token correctly setup', async () => {
      assert.equal(await holdToken.name(), 'Beneficiaries Token')
      assert.equal(await holdToken.symbol(), 'HOLD')
      assert.equal((await holdToken.decimals()).toString(), 18)
      assert.equal((await holdToken.totalSupply()).toString(), 2e18)
      assert.equal((await holdToken.balanceOf(beneficiaryKey1)).toString(), 1e18)
      assert.equal((await holdToken.balanceOf(beneficiaryKey2)).toString(), 1e18)
    })

    it('should have heirs token correctly setup', async () => {
      assert.equal(await heirsToken.name(), 'Heirs Token')
      assert.equal(await heirsToken.symbol(), 'HEIRS')
      assert.equal((await heirsToken.decimals()).toString(), 18)
      assert.equal((await heirsToken.totalSupply()).toString(), 100e18)
      assert.equal((await heirsToken.balanceOf(ZERO_ADDRESS)).toString(), 34e18)
      assert.equal((await heirsToken.balanceOf(heir1)).toString(), 33e18)
      assert.equal((await heirsToken.balanceOf(heir2)).toString(), 33e18)
    })

    it('should have hold voting app correctly setup', async () => {
      assert.isTrue(await holdVoting.hasInitialized(), 'hold voting not initialized')
      assert.equal((await holdVoting.supportRequiredPct()).toString(), 999999999999999999)
      assert.equal((await holdVoting.minAcceptQuorumPct()).toString(), 0)
      assert.equal((await holdVoting.voteTime()).toString(), 60 * 60 * 24 * 7)

      await assertRole(acl, holdVoting, holdVoting, 'CREATE_VOTES_ROLE', holdTokenManager)
      await assertRole(acl, holdVoting, holdVoting, 'MODIFY_QUORUM_ROLE')
      await assertRole(acl, holdVoting, holdVoting, 'MODIFY_SUPPORT_ROLE')
    })

    it('should have heirs voting app correctly setup', async () => {
      assert.isTrue(await heirsVoting.hasInitialized(), 'heirs voting not initialized')
      assert.equal((await heirsVoting.supportRequiredPct()).toString(), 66e16)
      assert.equal((await heirsVoting.minAcceptQuorumPct()).toString(), 0)
      assert.equal((await heirsVoting.voteTime()).toString(), 60 * 60 * 24 * 365)

      await assertRole(acl, heirsVoting, heirsVoting, 'CREATE_VOTES_ROLE', heirsTokenManager)
      await assertRole(acl, heirsVoting, heirsVoting, 'MODIFY_QUORUM_ROLE')
      await assertRole(acl, heirsVoting, heirsVoting, 'MODIFY_SUPPORT_ROLE')
    })

    it('should have hold token manager app correctly setup', async () => {
      assert.isTrue(await holdTokenManager.hasInitialized(), 'hold token manager not initialized')
      assert.equal(await holdTokenManager.token(), holdToken.address)

      await assertRole(acl, holdTokenManager, multiSig, 'MINT_ROLE')
      await assertRole(acl, holdTokenManager, multiSig, 'BURN_ROLE')
      await assertRole(acl, holdTokenManager, holdVoting, 'ASSIGN_ROLE')
      await assertRole(acl, holdTokenManager, holdVoting, 'REVOKE_VESTINGS_ROLE')

      await assertMissingRole(acl, holdTokenManager, 'ISSUE_ROLE')
    })

    it('should have heirs token manager app correctly setup', async () => {
      assert.isTrue(await heirsTokenManager.hasInitialized(), 'heirs token manager not initialized')
      assert.equal(await heirsTokenManager.token(), heirsToken.address)

      await assertRole(acl, heirsTokenManager, multiSig, 'MINT_ROLE')
      await assertRole(acl, heirsTokenManager, multiSig, 'BURN_ROLE')
      await assertRole(acl, heirsTokenManager, heirsVoting, 'ASSIGN_ROLE')
      await assertRole(acl, heirsTokenManager, heirsVoting, 'REVOKE_VESTINGS_ROLE')

      await assertMissingRole(acl, heirsTokenManager, 'ISSUE_ROLE')
    })

    it('should have vault app correctly setup', async () => {
      assert.isTrue(await vault.hasInitialized(), 'vault not initialized')
      await assertRole(acl, vault, holdVoting, 'TRANSFER_ROLE', finance)
    })

    it('should have finance app correctly setup', async () => {
      assert.isTrue(await finance.hasInitialized(), 'finance not initialized')
      assert.equal(web3.toChecksumAddress(await finance.vault()), vault.address)

      await assertRole(acl, finance, holdVoting, 'CREATE_PAYMENTS_ROLE')
      await assertRole(acl, finance, holdVoting, 'EXECUTE_PAYMENTS_ROLE')
      await assertRole(acl, finance, holdVoting, 'MANAGE_PAYMENTS_ROLE')

      await assertMissingRole(acl, finance, 'CHANGE_PERIOD_ROLE')
      await assertMissingRole(acl, finance, 'CHANGE_BUDGETS_ROLE')
    })

    it('should have agent app correctly setup', async () => {
      assert.isTrue(await agent.hasInitialized(), 'agent not initialized')
      assert.equal(await agent.designatedSigner(), ZERO_ADDRESS)

      await assertRole(acl, agent, holdVoting, 'EXECUTE_ROLE', holdVoting)
      await assertRole(acl, agent, holdVoting, 'RUN_SCRIPT_ROLE', holdVoting)
      await assertRole(acl, agent, holdVoting, 'EXECUTE_ROLE', heirsVoting)
      await assertRole(acl, agent, holdVoting, 'RUN_SCRIPT_ROLE', heirsVoting)

      await assertMissingRole(acl, agent, 'DESIGNATE_SIGNER_ROLE')
      await assertMissingRole(acl, agent, 'ADD_PRESIGNED_HASH_ROLE')
    })

    it('setup DAO and ACL permissions correctly', async () => {
      await assertRole(acl, dao, holdVoting, 'APP_MANAGER_ROLE')
      await assertRole(acl, acl, holdVoting, 'CREATE_PERMISSIONS_ROLE')
    })

    it('setup EVM scripts registry permissions correctly', async () => {
      const reg = await EVMScriptRegistry.at(await acl.getEVMScriptRegistry())
      await assertRole(acl, reg, holdVoting, 'REGISTRY_ADD_EXECUTOR_ROLE')
      await assertRole(acl, reg, holdVoting, 'REGISTRY_MANAGER_ROLE')
    })
  })
})
