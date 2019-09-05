const { hash: namehash } = require('eth-ens-namehash')
const { randomId } = require('@aragon/templates-shared/helpers/aragonId')
const { getEventArgument } = require('@aragon/test-helpers/events')
const { getENS, getTemplateAddress } = require('@aragon/templates-shared/lib/ens')(web3, artifacts)
const { getInstalledAppsById } = require('@aragon/templates-shared/helpers/events')(artifacts)
const { assertRole, assertMissingRole } = require('@aragon/templates-shared/helpers/assertRole')(web3)
const assertRevert = require('@aragon/templates-shared/helpers/assertRevert')(web3)

const TrustTemplate = artifacts.require('TrustTemplate')

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

contract('Trust', ([_, owner, beneficiaryKey1, beneficiaryKey2, heir1, heir2, multiSigKey1, multiSigKey2]) => {
  let daoID, template, dao, multiSig, acl, ens, prepareReceipt, setupReceipt, multiSigSetupReceipt
  let holdVoting, heirsVoting, holdTokenManager, heirsTokenManager, holdToken, heirsToken, vault, finance, agent

  const HEIRS = [heir1, heir2]
  const HEIRS_STAKE = HEIRS.map(() => 33e18)
  const MULTI_SIG_KEYS = [multiSigKey1, multiSigKey2]
  const BENEFICIARY_KEYS = [beneficiaryKey1, beneficiaryKey2]

  before('fetch trust template and ENS', async () => {
    ens = await getENS()
    template = TrustTemplate.at(await getTemplateAddress())
  })

  context('when the creation fails', () => {
    context('when there was no DAO prepared', () => {
      it('reverts when trying to setup a new DAO', async () => {
        await assertRevert(template.setupInstance(randomId(), BENEFICIARY_KEYS, HEIRS, HEIRS_STAKE), 'TRUST_MISSING_SENDER_CACHE')
      })

      it('reverts when trying to setup a new multisig wallet', async () => {
        await assertRevert(template.setupMultiSig(MULTI_SIG_KEYS), 'TRUST_MISSING_SENDER_CACHE')
      })
    })

    context('when there was a DAO prepared', () => {
      before('prepare DAO', async () => {
        daoID = randomId()
        await template.prepareInstance()
      })

      it('reverts when the given beneficiary keys are not 2', async () => {
        await assertRevert(template.setupInstance(daoID, [beneficiaryKey1], HEIRS, HEIRS_STAKE), 'TRUST_BAD_BENEFICIARY_KEY_LENGTH')
        await assertRevert(template.setupInstance(daoID, [beneficiaryKey1, beneficiaryKey2, heir1], HEIRS, HEIRS_STAKE), 'TRUST_BAD_BENEFICIARY_KEY_LENGTH')
      })

      it('reverts when the given heirs do not match', async () => {
        await assertRevert(template.setupInstance(daoID, BENEFICIARY_KEYS, HEIRS, [66e18]), 'TRUST_BAD_HEIRS_LENGTH')
      })

      it('reverts when the given heirs stake do not represent a 66%', async () => {
        await assertRevert(template.setupInstance(daoID, BENEFICIARY_KEYS, HEIRS, [1e18, 1e18]), 'TRUST_INVALID_HEIRS_STAKE')
      })

      it('reverts when an empty id is provided', async () => {
        await assertRevert(template.setupInstance('', BENEFICIARY_KEYS, HEIRS, HEIRS_STAKE), 'TEMPLATE_INVALID_ID')
      })

      context('when there was no DAO setup', () => {
        it('reverts when trying to setup a new multisig wallet', async () => {
          await assertRevert(template.setupMultiSig(MULTI_SIG_KEYS), 'TRUST_MISSING_SENDER_CACHE')
        })
      })

      context('when there was a DAO setup', () => {
        before('prepare DAO', async () => {
          await template.setupInstance(daoID, BENEFICIARY_KEYS, HEIRS, HEIRS_STAKE)
        })

        it('reverts when the given multi sig keys are not 2', async () => {
          await assertRevert(template.setupMultiSig([multiSigKey1]), 'TRUST_BAD_MULTI_SIG_KEYS_LENGTH')
          await assertRevert(template.setupMultiSig([multiSigKey1, multiSigKey2, heir1]), 'TRUST_BAD_MULTI_SIG_KEYS_LENGTH')
        })
      })
    })
  })

  context('when the creation succeeds', () => {
    before('create trust entity', async () => {
      daoID = randomId()
      prepareReceipt = await template.prepareInstance({ from: owner })
      setupReceipt = await template.setupInstance(daoID, BENEFICIARY_KEYS, HEIRS, HEIRS_STAKE, { from: owner })
      multiSigSetupReceipt = await template.setupMultiSig(MULTI_SIG_KEYS, { from: owner })

      dao = Kernel.at(getEventArgument(prepareReceipt, 'DeployDao', 'dao'))
      holdToken = MiniMeToken.at(getEventArgument(prepareReceipt, 'DeployToken', 'token', 0))
      heirsToken = MiniMeToken.at(getEventArgument(prepareReceipt, 'DeployToken', 'token', 1))
      multiSig = MultiSigWallet.at(getEventArgument(multiSigSetupReceipt, 'DeployMultiSig', 'multiSig'))

      assert.equal(dao.address, getEventArgument(multiSigSetupReceipt, 'SetupDao', 'dao'), 'should have emitted a SetupDao event')
    })

    before('load apps', async () => {
      const installedApps = getInstalledAppsById(setupReceipt)
      assert.equal(installedApps.vault.length, 1, 'should have installed 1 vault app')
      assert.equal(installedApps.agent.length, 1, 'should have installed 1 agent app')
      assert.equal(installedApps.voting.length, 2, 'should have installed 2 voting apps')
      assert.equal(installedApps.finance.length, 1, 'should have installed 1 finance app')
      assert.equal(installedApps['token-manager'].length, 2, 'should have installed 2 token manager apps')

      acl = ACL.at(await dao.acl())
      agent = Agent.at(installedApps.agent[0])
      vault = Vault.at(installedApps.vault[0])
      finance = Finance.at(installedApps.finance[0])
      holdVoting = Voting.at(installedApps.voting[0])
      heirsVoting = Voting.at(installedApps.voting[1])
      holdTokenManager = TokenManager.at(installedApps['token-manager'][0])
      heirsTokenManager = TokenManager.at(installedApps['token-manager'][1])
    })

    it('costs ~12.51e6 gas', async () => {
      assert.isAtMost(prepareReceipt.receipt.gasUsed, 5e6, 'prepare script should cost almost 5.00e6 gas')
      assert.isAtMost(setupReceipt.receipt.gasUsed, 5.7e6, 'setup script should cost almost 5.67e6 gas')
      assert.isAtMost(multiSigSetupReceipt.receipt.gasUsed, 1.85e6, 'multisig script should cost almost 1.85e6 gas')
    })

    it('registers a new DAO on ENS', async () => {
      const aragonIdNameHash = namehash(`${daoID}.aragonid.eth`)
      const resolvedAddress = await PublicResolver.at(await ens.resolver(aragonIdNameHash)).addr(aragonIdNameHash)
      assert.equal(resolvedAddress, dao.address, 'aragonId ENS name does not match')
    })

    it('creates a new beneficiaries token', async () => {
      assert.equal(await holdToken.name(), 'Beneficiaries Token')
      assert.equal(await holdToken.symbol(), 'HOLD')
      assert.equal(await holdToken.transfersEnabled(), true)
      assert.equal((await holdToken.decimals()).toString(), 18)
    })

    it('should have minted hold tokens for the beneficiaries', async () => {
      assert.equal((await holdToken.totalSupply()).toString(), 2e18)
      assert.equal((await holdToken.balanceOf(beneficiaryKey1)).toString(), 1e18)
      assert.equal((await holdToken.balanceOf(beneficiaryKey2)).toString(), 1e18)
    })

    it('creates a new heirs token', async () => {
      assert.equal(await heirsToken.name(), 'Heirs Token')
      assert.equal(await heirsToken.symbol(), 'HEIRS')
      assert.equal(await heirsToken.transfersEnabled(), true)
      assert.equal((await heirsToken.decimals()).toString(), 18)
    })

    it('should have minted heirs tokens for the heirs and burned another 34%', async () => {
      assert.equal((await heirsToken.totalSupply()).toString(), 100e18)
      assert.equal((await heirsToken.balanceOf(heir1)).toString(), 33e18)
      assert.equal((await heirsToken.balanceOf(heir2)).toString(), 33e18)
      assert.equal((await heirsToken.balanceOf(ZERO_ADDRESS)).toString(), 34e18)
    })

    it('sets up a multi sig wallet correctly', async () => {
      assert.equal((await multiSig.required()).toString(), 2, 'multi sig should have 2 required confirmations')

      const owners = (await multiSig.getOwners())
      assert.equal(owners.length, 3, 'multi sig should have 3 owners')
      assert.equal(owners[0], multiSigKey1, 'multi sig does not include multiSigKey1 as one of their owners')
      assert.equal(owners[1], multiSigKey2, 'multi sig does not include multiSigKey2 as one of their owners')
      assert.equal(web3.toChecksumAddress(owners[2]), agent.address, 'multi sig does not include the agent as one of their owners')
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

      await assertRole(acl, holdTokenManager, holdVoting, 'ASSIGN_ROLE')
      await assertRole(acl, holdTokenManager, holdVoting, 'REVOKE_VESTINGS_ROLE')
      await assertRole(acl, holdTokenManager, multiSig, 'MINT_ROLE')
      await assertRole(acl, holdTokenManager, multiSig, 'BURN_ROLE')

      await assertMissingRole(acl, holdTokenManager, 'ISSUE_ROLE')
    })

    it('should have heirs token manager app correctly setup', async () => {
      assert.isTrue(await heirsTokenManager.hasInitialized(), 'heirs token manager not initialized')
      assert.equal(await heirsTokenManager.token(), heirsToken.address)

      await assertRole(acl, heirsTokenManager, heirsVoting, 'ASSIGN_ROLE')
      await assertRole(acl, heirsTokenManager, heirsVoting, 'REVOKE_VESTINGS_ROLE')
      await assertRole(acl, heirsTokenManager, multiSig, 'MINT_ROLE')
      await assertRole(acl, heirsTokenManager, multiSig, 'BURN_ROLE')

      await assertMissingRole(acl, heirsTokenManager, 'ISSUE_ROLE')
    })

    it('should have vault app correctly setup', async () => {
      assert.isTrue(await vault.hasInitialized(), 'vault not initialized')
      await assertRole(acl, vault, holdVoting, 'TRANSFER_ROLE', finance)
    })

    it('should have finance app correctly setup', async () => {
      assert.isTrue(await finance.hasInitialized(), 'finance not initialized')
      assert.equal((await finance.getPeriodDuration()).toString(), 60 * 60 * 24 * 30, 'finance period should be 30 days')
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

    it('sets up EVM scripts registry permissions correctly', async () => {
      const reg = await EVMScriptRegistry.at(await acl.getEVMScriptRegistry())
      await assertRole(acl, reg, holdVoting, 'REGISTRY_ADD_EXECUTOR_ROLE')
      await assertRole(acl, reg, holdVoting, 'REGISTRY_MANAGER_ROLE')
    })

    it('sets up DAO and ACL permissions correctly', async () => {
      await assertRole(acl, dao, holdVoting, 'APP_MANAGER_ROLE')
      await assertRole(acl, acl, holdVoting, 'CREATE_PERMISSIONS_ROLE')
    })
  })
})
