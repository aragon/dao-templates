const encodeCall = require('@aragon/templates-shared/helpers/encodeCall')
const assertRevert = require('@aragon/templates-shared/helpers/assertRevert')(web3)

const { hash: namehash } = require('eth-ens-namehash')
const { APP_IDS } = require('@aragon/templates-shared/helpers/apps')
const { randomId } = require('@aragon/templates-shared/helpers/aragonId')
const { getEventArgument } = require('@aragon/test-helpers/events')
const { getENS, getTemplateAddress } = require('@aragon/templates-shared/lib/ens')(web3, artifacts)
const { getInstalledAppsById } = require('@aragon/templates-shared/helpers/events')(artifacts)
const { assertRole, assertMissingRole, assertRoleNotGranted } = require('@aragon/templates-shared/helpers/assertRole')(web3)

const CompanyTemplate = artifacts.require('CompanyBoardTemplate')

const ACL = artifacts.require('ACL')
const Kernel = artifacts.require('Kernel')
const Agent = artifacts.require('Agent')
const Vault = artifacts.require('Vault')
const Voting = artifacts.require('Voting')
const Payroll = artifacts.require('Payroll')
const Finance = artifacts.require('Finance')
const TokenManager = artifacts.require('TokenManager')
const MiniMeToken = artifacts.require('MiniMeToken')
const MockContract = artifacts.require('Migrations')
const PublicResolver = artifacts.require('PublicResolver')
const EVMScriptRegistry = artifacts.require('EVMScriptRegistry')

const ONE_DAY = 60 * 60 * 24
const ONE_WEEK = ONE_DAY * 7
const THIRTY_DAYS = ONE_DAY * 30
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

contract('Company with board', ([_, owner, boardMember1, boardMember2, shareHolder1, shareHolder2, shareHolder3, someone]) => {
  let daoID, template, dao, acl, ens, feed
  let shareVoting, boardVoting, boardTokenManager, shareTokenManager, boardToken, shareToken, finance, agent, vault, payroll

  const BOARD_MEMBERS = [boardMember1, boardMember2]
  const SHARE_HOLDERS = [shareHolder1, shareHolder2, shareHolder3]
  const SHARE_STAKES = SHARE_HOLDERS.map(() => 1e18)
  const SHARE_TOKEN_NAME = 'Share Token'
  const SHARE_TOKEN_SYMBOL = 'SHARE'

  const BOARD_VOTE_DURATION = ONE_WEEK
  const BOARD_SUPPORT_REQUIRED = 50e16
  const BOARD_MIN_ACCEPTANCE_QUORUM = 40e16
  const BOARD_VOTING_SETTINGS = [BOARD_SUPPORT_REQUIRED, BOARD_MIN_ACCEPTANCE_QUORUM, BOARD_VOTE_DURATION]

  const SHARE_VOTE_DURATION = ONE_WEEK
  const SHARE_SUPPORT_REQUIRED = 50e16
  const SHARE_MIN_ACCEPTANCE_QUORUM = 5e16
  const SHARE_VOTING_SETTINGS = [SHARE_SUPPORT_REQUIRED, SHARE_MIN_ACCEPTANCE_QUORUM, SHARE_VOTE_DURATION]

  const PAYROLL_DENOMINATION_TOKEN = '0x0000000000000000000000000000000000000abc'
  const PAYROLL_RATE_EXPIRY_TIME = THIRTY_DAYS

  before('fetch company board template and ENS', async () => {
    ens = await getENS()
    template = CompanyTemplate.at(await getTemplateAddress())
  })

  const finalizeInstance = (...params) => {
    const lastParam = params[params.length - 1]
    const txParams = (!Array.isArray(lastParam) && typeof lastParam === 'object') ? params.pop() : {}
    const finalizeInstanceFn = CompanyTemplate.abi.find(({ name, inputs }) => name === 'finalizeInstance' && inputs.length === params.length)
    return template.sendTransaction(encodeCall(finalizeInstanceFn, params, txParams))
  }

  context('when the creation fails', () => {
    const FINANCE_PERIOD = 0
    const USE_AGENT_AS_VAULT = true

    context('when there was no instance prepared before', () => {
      it('reverts when there was no instance prepared before', async () => {
        await assertRevert(finalizeInstance(randomId(), SHARE_HOLDERS, SHARE_STAKES, BOARD_MEMBERS, FINANCE_PERIOD, USE_AGENT_AS_VAULT), 'COMPANYBD_MISSING_CACHE')
      })
    })

    context('when there was an instance already prepared', () => {
      before('prepare instance', async () => {
        await template.prepareInstance(SHARE_TOKEN_NAME, SHARE_TOKEN_SYMBOL, SHARE_VOTING_SETTINGS, BOARD_VOTING_SETTINGS)
      })

      it('reverts when no share members were given', async () => {
        await assertRevert(finalizeInstance(randomId(), [], SHARE_STAKES, BOARD_MEMBERS, FINANCE_PERIOD, USE_AGENT_AS_VAULT), 'COMPANYBD_MISSING_SHARE_MEMBERS')
      })

      it('reverts when number of shared members and stakes do not match', async () => {
        await assertRevert(finalizeInstance(randomId(), [shareHolder1], SHARE_STAKES, BOARD_MEMBERS, FINANCE_PERIOD, USE_AGENT_AS_VAULT), 'COMPANYBD_BAD_HOLDERS_STAKES_LEN')
        await assertRevert(finalizeInstance(randomId(), SHARE_HOLDERS, [1e18], BOARD_MEMBERS, FINANCE_PERIOD, USE_AGENT_AS_VAULT), 'COMPANYBD_BAD_HOLDERS_STAKES_LEN')
      })

      it('reverts when an empty id is provided', async () => {
        await assertRevert(finalizeInstance('', SHARE_HOLDERS, SHARE_STAKES, BOARD_MEMBERS, FINANCE_PERIOD, USE_AGENT_AS_VAULT), 'TEMPLATE_INVALID_ID')
      })
    })
  })

  context('when the creation succeeds', () => {
    let prepareReceipt, finalizeInstanceReceipt

    const loadDAO = async (apps = { vault: false, agent: false, payroll: false }) => {
      dao = Kernel.at(getEventArgument(prepareReceipt, 'DeployDao', 'dao'))
      shareToken = MiniMeToken.at(getEventArgument(prepareReceipt, 'DeployToken', 'token', 0))
      boardToken = MiniMeToken.at(getEventArgument(prepareReceipt, 'DeployToken', 'token', 1))
      acl = ACL.at(await dao.acl())

      const installedAppsDuringPrepare = getInstalledAppsById(prepareReceipt)
      const installedAppsDuringFinalize = getInstalledAppsById(finalizeInstanceReceipt)

      assert.equal(dao.address, getEventArgument(finalizeInstanceReceipt, 'SetupDao', 'dao'), 'should have emitted a SetupDao event')

      assert.equal(installedAppsDuringPrepare.voting.length, 2, 'should have installed 2 voting apps during prepare')
      shareVoting = Voting.at(installedAppsDuringPrepare.voting[0])
      boardVoting = Voting.at(installedAppsDuringPrepare.voting[1])

      assert.equal(installedAppsDuringFinalize['token-manager'].length, 2, 'should have installed 2 token-manager apps during finalize')
      shareTokenManager = TokenManager.at(installedAppsDuringFinalize['token-manager'][0])
      boardTokenManager = TokenManager.at(installedAppsDuringFinalize['token-manager'][1])

      assert.equal(installedAppsDuringFinalize.finance.length, 1, 'should have installed 1 finance app')
      finance = Finance.at(installedAppsDuringFinalize.finance[0])

      if (apps.agent) {
        assert.equal(installedAppsDuringFinalize.agent.length, 1, 'should have installed 1 agent app')
        agent = Agent.at(installedAppsDuringFinalize.agent[0])
      }

      if (apps.vault) {
        assert.equal(installedAppsDuringFinalize.vault.length, 1, 'should have installed 1 vault app')
        vault = Vault.at(installedAppsDuringFinalize.vault[0])
      }

      if (apps.payroll) {
        assert.equal(installedAppsDuringFinalize.payroll.length, 1, 'should have installed 1 payroll app')
        payroll = Payroll.at(installedAppsDuringFinalize.payroll[0])
      }
    }

    const itCostsUpTo = expectedFinalizationCost => {
      const expectedPrepareCost = 6.1e6
      const expectedTotalCost = expectedPrepareCost + expectedFinalizationCost

      it(`gas costs must be up to ~${expectedTotalCost} gas`, async () => {
        const prepareCost = prepareReceipt.receipt.gasUsed
        assert.isAtMost(prepareCost, expectedPrepareCost, `prepare call should cost up to ${expectedPrepareCost} gas`)

        const finalizeCost = finalizeInstanceReceipt.receipt.gasUsed
        assert.isAtMost(finalizeCost, expectedFinalizationCost, `share setup call should cost up to ${expectedFinalizationCost} gas`)

        const totalCost = prepareCost + finalizeCost
        assert.isAtMost(totalCost, expectedTotalCost, `total costs should be up to ${expectedTotalCost} gas`)
      })
    }

    const itSetupsDAOCorrectly = (financePeriod) => {
      it('registers a new DAO on ENS', async () => {
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
        assert.equal((await boardVoting.supportRequiredPct()).toString(), BOARD_SUPPORT_REQUIRED)
        assert.equal((await boardVoting.minAcceptQuorumPct()).toString(), BOARD_MIN_ACCEPTANCE_QUORUM)
        assert.equal((await boardVoting.voteTime()).toString(), BOARD_VOTE_DURATION)

        await assertRole(acl, boardVoting, shareVoting, 'CREATE_VOTES_ROLE', boardTokenManager)
        await assertRole(acl, boardVoting, shareVoting, 'MODIFY_QUORUM_ROLE')
        await assertRole(acl, boardVoting, shareVoting, 'MODIFY_SUPPORT_ROLE')
      })

      it('should have share voting app correctly setup', async () => {
        assert.isTrue(await shareVoting.hasInitialized(), 'voting not initialized')
        assert.equal((await shareVoting.supportRequiredPct()).toString(), SHARE_SUPPORT_REQUIRED)
        assert.equal((await shareVoting.minAcceptQuorumPct()).toString(), SHARE_MIN_ACCEPTANCE_QUORUM)
        assert.equal((await shareVoting.voteTime()).toString(), SHARE_VOTE_DURATION)

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

        const expectedPeriod = financePeriod === 0 ? THIRTY_DAYS : financePeriod
        assert.equal((await finance.getPeriodDuration()).toString(), expectedPeriod, 'finance period should be 30 days')

        await assertRole(acl, finance, shareVoting, 'CREATE_PAYMENTS_ROLE', boardVoting)
        await assertRole(acl, finance, shareVoting, 'EXECUTE_PAYMENTS_ROLE', boardVoting)
        await assertRole(acl, finance, shareVoting, 'MANAGE_PAYMENTS_ROLE', boardVoting)

        await assertMissingRole(acl, finance, 'CHANGE_PERIOD_ROLE')
        await assertMissingRole(acl, finance, 'CHANGE_BUDGETS_ROLE')
      })

      it('sets up DAO and ACL permissions correctly', async () => {
        await assertRole(acl, dao, shareVoting, 'APP_MANAGER_ROLE')
        await assertRole(acl, acl, shareVoting, 'CREATE_PERMISSIONS_ROLE')

        await assertRoleNotGranted(acl, dao, 'APP_MANAGER_ROLE', template)
        await assertRoleNotGranted(acl, acl, 'CREATE_PERMISSIONS_ROLE', template)
      })

      it('sets up EVM scripts registry permissions correctly', async () => {
        const reg = await EVMScriptRegistry.at(await acl.getEVMScriptRegistry())
        await assertRole(acl, reg, shareVoting, 'REGISTRY_ADD_EXECUTOR_ROLE')
        await assertRole(acl, reg, shareVoting, 'REGISTRY_MANAGER_ROLE')
      })
    }

    const itSetupsAgentAppCorrectly = () => {
      it('should have agent app correctly setup', async () => {
        assert.isTrue(await agent.hasInitialized(), 'agent not initialized')
        assert.equal(await agent.designatedSigner(), ZERO_ADDRESS)

        assert.equal(await dao.recoveryVaultAppId(), APP_IDS.agent, 'agent app is not being used as the vault app of the DAO')
        assert.equal(web3.toChecksumAddress(await finance.vault()), agent.address, 'finance vault is not linked to the agent app')
        assert.equal(web3.toChecksumAddress(await dao.getRecoveryVault()), agent.address, 'agent app is not being used as the vault app of the DAO')

        await assertRole(acl, agent, shareVoting, 'EXECUTE_ROLE', boardVoting)
        await assertRole(acl, agent, shareVoting, 'RUN_SCRIPT_ROLE', boardVoting)
        await assertRole(acl, agent, shareVoting, 'TRANSFER_ROLE', finance)

        await assertMissingRole(acl, agent, 'DESIGNATE_SIGNER_ROLE')
        await assertMissingRole(acl, agent, 'ADD_PRESIGNED_HASH_ROLE')
      })
    }

    const itSetupsVaultAppCorrectly = () => {
      it('should have vault app correctly setup', async () => {
        assert.isTrue(await vault.hasInitialized(), 'vault not initialized')

        assert.equal(await dao.recoveryVaultAppId(), APP_IDS.vault, 'vault app is not being used as the vault app of the DAO')
        assert.equal(web3.toChecksumAddress(await finance.vault()), vault.address, 'finance vault is not the vault app')
        assert.equal(web3.toChecksumAddress(await dao.getRecoveryVault()), vault.address, 'vault app is not being used as the vault app of the DAO')

        await assertRole(acl, vault, shareVoting, 'TRANSFER_ROLE', finance)
      })
    }

    const itSetupsPayrollAppCorrectly = employeeManager => {
      it('should have payroll app correctly setup', async () => {
        assert.isTrue(await payroll.hasInitialized(), 'payroll not initialized')
        assert.equal(await payroll.feed(), feed.address)
        assert.equal(await payroll.rateExpiryTime(), PAYROLL_RATE_EXPIRY_TIME)
        assert.equal(await payroll.denominationToken(), PAYROLL_DENOMINATION_TOKEN)
        assert.equal(web3.toChecksumAddress(await payroll.finance()), finance.address)

        await assertRole(acl, finance, shareVoting, 'CREATE_PAYMENTS_ROLE', payroll)
        await assertRoleNotGranted(acl, finance, 'CREATE_PAYMENTS_ROLE', template)

        const expectedGrantee = employeeManager === ZERO_ADDRESS ? boardVoting : { address: employeeManager }

        await assertRole(acl, payroll, boardVoting, 'ADD_BONUS_ROLE', expectedGrantee)
        await assertRole(acl, payroll, boardVoting, 'ADD_EMPLOYEE_ROLE', expectedGrantee)
        await assertRole(acl, payroll, boardVoting, 'ADD_REIMBURSEMENT_ROLE', expectedGrantee)
        await assertRole(acl, payroll, boardVoting, 'TERMINATE_EMPLOYEE_ROLE', expectedGrantee)
        await assertRole(acl, payroll, boardVoting, 'SET_EMPLOYEE_SALARY_ROLE', expectedGrantee)

        await assertRole(acl, payroll, boardVoting, 'MODIFY_PRICE_FEED_ROLE', boardVoting)
        await assertRole(acl, payroll, boardVoting, 'MODIFY_RATE_EXPIRY_ROLE', boardVoting)
        await assertRole(acl, payroll, boardVoting, 'MANAGE_ALLOWED_TOKENS_ROLE', boardVoting)
      })
    }

    context('when not requesting a payroll app', () => {
      const createDAO = (useAgentAsVault, financePeriod) => {
        before('create company entity with board', async () => {
          daoID = randomId()
          prepareReceipt = await template.prepareInstance(SHARE_TOKEN_NAME, SHARE_TOKEN_SYMBOL, SHARE_VOTING_SETTINGS, BOARD_VOTING_SETTINGS, { from: owner })
          finalizeInstanceReceipt = await finalizeInstance(daoID, SHARE_HOLDERS, SHARE_STAKES, BOARD_MEMBERS, financePeriod, useAgentAsVault, { from: owner })

          dao = Kernel.at(getEventArgument(prepareReceipt, 'DeployDao', 'dao'))
          shareToken = MiniMeToken.at(getEventArgument(prepareReceipt, 'DeployToken', 'token', 0))
          boardToken = MiniMeToken.at(getEventArgument(prepareReceipt, 'DeployToken', 'token', 1))
          await loadDAO({ vault: !useAgentAsVault, agent: useAgentAsVault })
        })
      }

      context('when requesting a custom finance period', () => {
        const FINANCE_PERIOD = 60 * 60 * 24 * 15 // 15 days

        context('when requesting an agent app', () => {
          const USE_AGENT_AS_VAULT = true

          createDAO(USE_AGENT_AS_VAULT, FINANCE_PERIOD)
          itCostsUpTo(4.4e6)
          itSetupsDAOCorrectly(FINANCE_PERIOD)
          itSetupsAgentAppCorrectly()
        })

        context('when requesting a vault app', () => {
          const USE_AGENT_AS_VAULT = false

          createDAO(USE_AGENT_AS_VAULT, FINANCE_PERIOD)
          itCostsUpTo(4.03e6)
          itSetupsDAOCorrectly(FINANCE_PERIOD)
          itSetupsVaultAppCorrectly()
        })
      })

      context('when requesting a default finance period', () => {
        const FINANCE_PERIOD = 0 // use default

        context('when requesting an agent app', () => {
          const USE_AGENT_AS_VAULT = true

          createDAO(USE_AGENT_AS_VAULT, FINANCE_PERIOD)
          itCostsUpTo(4.4e6)
          itSetupsDAOCorrectly(FINANCE_PERIOD)
          itSetupsAgentAppCorrectly()
        })

        context('when requesting a vault app', () => {
          const USE_AGENT_AS_VAULT = false

          createDAO(USE_AGENT_AS_VAULT, FINANCE_PERIOD)
          itCostsUpTo(4.03e6)
          itSetupsDAOCorrectly(FINANCE_PERIOD)
          itSetupsVaultAppCorrectly()
        })
      })
    })

    context('when requesting a payroll app', () => {
      const FINANCE_PERIOD = 0
      const USE_AGENT_AS_VAULT = true

      const createDAO = (employeeManager = undefined) => {
        before('create company entity with board', async () => {
          daoID = randomId()
          feed = await MockContract.new() // has to be a contract
          prepareReceipt = await template.prepareInstance(SHARE_TOKEN_NAME, SHARE_TOKEN_SYMBOL, SHARE_VOTING_SETTINGS, BOARD_VOTING_SETTINGS, { from: owner })

          const payrollSettings = [PAYROLL_DENOMINATION_TOKEN, feed.address, PAYROLL_RATE_EXPIRY_TIME, employeeManager]
          finalizeInstanceReceipt = await finalizeInstance(daoID, SHARE_HOLDERS, SHARE_STAKES, BOARD_MEMBERS, FINANCE_PERIOD, USE_AGENT_AS_VAULT, payrollSettings, { from: owner })

          dao = Kernel.at(getEventArgument(prepareReceipt, 'DeployDao', 'dao'))
          shareToken = MiniMeToken.at(getEventArgument(prepareReceipt, 'DeployToken', 'token', 0))
          boardToken = MiniMeToken.at(getEventArgument(prepareReceipt, 'DeployToken', 'token', 1))
          await loadDAO({ vault: !USE_AGENT_AS_VAULT, agent: USE_AGENT_AS_VAULT, payroll: true })
        })
      }

      context('when requesting a custom employee manager', () => {
        const EMPLOYEE_MANAGER = someone

        createDAO(EMPLOYEE_MANAGER)
        itCostsUpTo(5.55e6)
        itSetupsDAOCorrectly(FINANCE_PERIOD)
        itSetupsAgentAppCorrectly()
        itSetupsPayrollAppCorrectly(EMPLOYEE_MANAGER)
      })

      context('when requesting the default employee manager', () => {
        const EMPLOYEE_MANAGER = ZERO_ADDRESS

        createDAO(EMPLOYEE_MANAGER)
        itCostsUpTo(5.55e6)
        itSetupsDAOCorrectly(FINANCE_PERIOD)
        itSetupsAgentAppCorrectly()
        itSetupsPayrollAppCorrectly(EMPLOYEE_MANAGER)
      })
    })
  })
})
