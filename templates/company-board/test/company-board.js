const { hash: namehash } = require('eth-ens-namehash')
const { APP_IDS } = require('@aragon/templates-shared/helpers/apps')
const { randomId } = require('@aragon/templates-shared/helpers/aragonId')
const { getEventArgument } = require('@aragon/test-helpers/events')
const { deployedAddresses } = require('@aragon/templates-shared/lib/arapp-file')(web3)
const { getInstalledAppsById } = require('@aragon/templates-shared/helpers/events')(artifacts)
const { assertRole, assertMissingRole } = require('@aragon/templates-shared/helpers/assertRole')(web3)
const assertRevert = require('@aragon/templates-shared/helpers/assertRevert')(web3)

const CompanyTemplate = artifacts.require('CompanyBoardTemplate')

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

contract('Company with board', ([_, owner, boardMember1, boardMember2, shareHolder1, shareHolder2, shareHolder3]) => {
  let daoID, template, dao, acl, ens, setupReceipt, prepareReceipt
  let shareVoting, boardVoting, boardTokenManager, shareTokenManager, boardToken, shareToken, finance, agent

  const BOARD_MEMBERS = [boardMember1, boardMember2]
  const SHARE_HOLDERS = [shareHolder1, shareHolder2, shareHolder3]
  const SHARE_STAKES = SHARE_HOLDERS.map(() => 1e18)
  const SHARE_TOKEN_NAME = 'Share Token'
  const SHARE_TOKEN_SYMBOL = 'SHARE'

  before('fetch company board template and ENS', async () => {
    const { registry, address } = await deployedAddresses()
    ens = ENS.at(registry)
    template = CompanyTemplate.at(address)
  })

  before('build dao ID', () => {
    daoID = randomId()
  })

  context('when the creation fails', () => {
    context('when there was no instance prepared before', () => {
      it('reverts', async () => {
        await assertRevert(template.setupInstance.request(daoID, BOARD_MEMBERS, SHARE_HOLDERS, SHARE_STAKES), 'COMPANY_MISSING_DAO_CACHE')
      })
    })

    context('when there was an instance prepared before', () => {
      before('prepare instance', async () => {
        await template.prepareInstance(SHARE_TOKEN_NAME, SHARE_TOKEN_SYMBOL)
      })

      it('reverts when no board members were given', async () => {
        await assertRevert(template.setupInstance.request(daoID, [], SHARE_HOLDERS, SHARE_STAKES), 'COMPANY_MISSING_BOARD_MEMBERS')
      })

      it('reverts when no share members were given', async () => {
        await assertRevert(template.setupInstance.request(daoID, BOARD_MEMBERS, [], SHARE_STAKES), 'COMPANY_MISSING_SHARE_MEMBERS')
      })

      it('reverts when number of shared members and stakes do not match', async () => {
        await assertRevert(template.setupInstance.request(daoID, BOARD_MEMBERS, [shareHolder1], SHARE_STAKES), 'COMPANY_BAD_HOLDERS_STAKES_LEN')
        await assertRevert(template.setupInstance.request(daoID, BOARD_MEMBERS, SHARE_HOLDERS, [1e18]), 'COMPANY_BAD_HOLDERS_STAKES_LEN')
      })
    })
  })

  context('when the creation succeeds', () => {
    before('create company entity', async () => {
      prepareReceipt = await template.prepareInstance(SHARE_TOKEN_NAME, SHARE_TOKEN_SYMBOL, { from: owner })
      setupReceipt = await template.setupInstance(daoID, BOARD_MEMBERS, SHARE_HOLDERS, SHARE_STAKES, { from: owner })

      dao = Kernel.at(getEventArgument(prepareReceipt, 'DeployDao', 'dao'))
      boardToken = MiniMeToken.at(getEventArgument(prepareReceipt, 'DeployToken', 'token', 0))
      shareToken = MiniMeToken.at(getEventArgument(prepareReceipt, 'DeployToken', 'token', 1))
    })

    before('load apps', async () => {
      const installedApps = getInstalledAppsById(setupReceipt)
      assert.equal(installedApps.agent.length, 1, 'should have installed 1 agent app')
      assert.equal(installedApps.voting.length, 2, 'should have installed 2 voting apps')
      assert.equal(installedApps.finance.length, 1, 'should have installed 1 finance app')
      assert.equal(installedApps['token-manager'].length, 2, 'should have installed 2 token manager apps')

      acl = ACL.at(await dao.acl())
      agent = Agent.at(installedApps.agent[0])
      boardVoting = Voting.at(installedApps.voting[0])
      shareVoting = Voting.at(installedApps.voting[1])
      finance = Finance.at(installedApps.finance[0])
      boardTokenManager = TokenManager.at(installedApps['token-manager'][0])
      shareTokenManager = TokenManager.at(installedApps['token-manager'][1])
    })

    it('costs ~10.4e6 gas', async () => {
      assert.isAtMost(prepareReceipt.receipt.gasUsed, 5e6, 'prepare script should cost almost 5e6 gas')
      assert.isAtMost(setupReceipt.receipt.gasUsed, 5.4e6, 'setup script should cost almost 5.4e6 gas')
    })

    it('registers a new DAO on ENS', async () => {
      const ens = ENS.at((await deployedAddresses()).registry)
      const aragonIdNameHash = namehash(`${daoID}.aragonid.eth`)
      const resolvedAddress = await PublicResolver.at(await ens.resolver(aragonIdNameHash)).addr(aragonIdNameHash)
      assert.equal(resolvedAddress, dao.address, 'aragonId ENS name does not match')
    })

    it('creates a new board token', async () => {
      assert.equal(await boardToken.name(), 'Board Token')
      assert.equal(await boardToken.symbol(), 'BOARD')
      assert.equal((await boardToken.decimals()).toString(), 0)
    })

    it('mints requested amounts for the board members', async () => {
      assert.equal((await boardToken.totalSupply()).toString(), BOARD_MEMBERS.length)
      for (const holder of BOARD_MEMBERS) assert.equal((await boardToken.balanceOf(holder)).toString(), 1)
    })

    it('creates a new share token', async () => {
      assert.equal(await shareToken.name(), SHARE_TOKEN_NAME)
      assert.equal(await shareToken.symbol(), SHARE_TOKEN_SYMBOL)
      assert.equal((await shareToken.decimals()).toString(), 18)
    })

    it('mints requested amounts for the share holders', async () => {
      assert.equal((await shareToken.totalSupply()).toString(), SHARE_STAKES.reduce((a, b) => a + b))
      for (const holder of SHARE_HOLDERS) assert.equal((await shareToken.balanceOf(holder)).toString(), SHARE_STAKES[SHARE_HOLDERS.indexOf(holder)])
    })

    it('should have board voting app correctly setup', async () => {
      assert.isTrue(await boardVoting.hasInitialized(), 'voting not initialized')
      assert.equal((await boardVoting.supportRequiredPct()).toString(), 50e16)
      assert.equal((await boardVoting.minAcceptQuorumPct()).toString(), 40e16)
      assert.equal((await boardVoting.voteTime()).toString(), 60 * 60 * 24 * 7)

      await assertRole(acl, boardVoting, shareVoting, 'CREATE_VOTES_ROLE', boardTokenManager)
      await assertRole(acl, boardVoting, shareVoting, 'MODIFY_QUORUM_ROLE')
      await assertRole(acl, boardVoting, shareVoting, 'MODIFY_SUPPORT_ROLE')
    })

    it('should have share voting app correctly setup', async () => {
      assert.isTrue(await shareVoting.hasInitialized(), 'voting not initialized')
      assert.equal((await shareVoting.supportRequiredPct()).toString(), 50e16)
      assert.equal((await shareVoting.minAcceptQuorumPct()).toString(), 5e16)
      assert.equal((await shareVoting.voteTime()).toString(), 60 * 60 * 24 * 7)

      await assertRole(acl, shareVoting, shareVoting, 'CREATE_VOTES_ROLE', boardTokenManager)
      await assertRole(acl, shareVoting, shareVoting, 'MODIFY_QUORUM_ROLE')
      await assertRole(acl, shareVoting, shareVoting, 'MODIFY_SUPPORT_ROLE')
    })

    it('should have board token manager app correctly setup', async () => {
      assert.isTrue(await boardTokenManager.hasInitialized(), 'token manager not initialized')
      assert.equal(await boardTokenManager.token(), boardToken.address)

      await assertRole(acl, boardTokenManager, shareVoting, 'MINT_ROLE')
      await assertRole(acl, boardTokenManager, shareVoting, 'BURN_ROLE')

      await assertMissingRole(acl, boardTokenManager, 'ISSUE_ROLE')
      await assertMissingRole(acl, boardTokenManager, 'ASSIGN_ROLE')
      await assertMissingRole(acl, boardTokenManager, 'REVOKE_VESTINGS_ROLE')
    })

    it('should have share token manager app correctly setup', async () => {
      assert.isTrue(await shareTokenManager.hasInitialized(), 'token manager not initialized')
      assert.equal(await shareTokenManager.token(), shareToken.address)

      await assertRole(acl, shareTokenManager, shareVoting, 'MINT_ROLE')
      await assertRole(acl, shareTokenManager, shareVoting, 'BURN_ROLE')

      await assertMissingRole(acl, shareTokenManager, 'ISSUE_ROLE')
      await assertMissingRole(acl, shareTokenManager, 'ASSIGN_ROLE')
      await assertMissingRole(acl, shareTokenManager, 'REVOKE_VESTINGS_ROLE')
    })

    it('should have finance app correctly setup', async () => {
      assert.isTrue(await finance.hasInitialized(), 'finance not initialized')
      assert.equal((await finance.getPeriodDuration()).toString(), 60 * 60 * 24 * 30, 'finance period should be 30 days')
      assert.equal(web3.toChecksumAddress(await finance.vault()), agent.address)

      await assertRole(acl, finance, shareVoting, 'CREATE_PAYMENTS_ROLE', boardVoting)
      await assertRole(acl, finance, shareVoting, 'CREATE_PAYMENTS_ROLE')
      await assertRole(acl, finance, shareVoting, 'EXECUTE_PAYMENTS_ROLE')
      await assertRole(acl, finance, shareVoting, 'MANAGE_PAYMENTS_ROLE')

      await assertMissingRole(acl, finance, 'CHANGE_PERIOD_ROLE')
      await assertMissingRole(acl, finance, 'CHANGE_BUDGETS_ROLE')
    })

    it('should have agent app correctly setup', async () => {
      assert.isTrue(await agent.hasInitialized(), 'agent not initialized')
      assert.equal(await agent.designatedSigner(), ZERO_ADDRESS)

      assert.equal(await dao.recoveryVaultAppId(), APP_IDS.agent, 'agent app is not being used as the vault app of the DAO')
      assert.equal(web3.toChecksumAddress(await dao.getRecoveryVault()), agent.address, 'agent app is not being used as the vault app of the DAO')

      await assertRole(acl, agent, shareVoting, 'EXECUTE_ROLE')
      await assertRole(acl, agent, shareVoting, 'RUN_SCRIPT_ROLE')
      await assertRole(acl, agent, shareVoting, 'EXECUTE_ROLE', boardVoting)
      await assertRole(acl, agent, shareVoting, 'RUN_SCRIPT_ROLE', boardVoting)
      await assertRole(acl, agent, shareVoting, 'TRANSFER_ROLE', finance)

      await assertMissingRole(acl, agent, 'DESIGNATE_SIGNER_ROLE')
      await assertMissingRole(acl, agent, 'ADD_PRESIGNED_HASH_ROLE')
    })

    it('sets up DAO and ACL permissions correctly', async () => {
      await assertRole(acl, dao, shareVoting, 'APP_MANAGER_ROLE', boardVoting)
      await assertRole(acl, acl, shareVoting, 'CREATE_PERMISSIONS_ROLE', boardVoting)
    })

    it('sets up EVM scripts registry permissions correctly', async () => {
      const reg = await EVMScriptRegistry.at(await acl.getEVMScriptRegistry())
      await assertRole(acl, reg, shareVoting, 'REGISTRY_ADD_EXECUTOR_ROLE')
      await assertRole(acl, reg, shareVoting, 'REGISTRY_MANAGER_ROLE')
    })
  })
})
