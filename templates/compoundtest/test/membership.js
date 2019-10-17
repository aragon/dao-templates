const encodeCall = require('@aragon/templates-shared/helpers/encodeCall')
const assertRevert = require('@aragon/templates-shared/helpers/assertRevert')(web3)

const { hash: namehash } = require('eth-ens-namehash')
const { APP_IDS } = require('@aragon/templates-shared/helpers/apps')
const { randomId } = require('@aragon/templates-shared/helpers/aragonId')
const { getEventArgument } = require('@aragon/test-helpers/events')
const { getENS, getTemplateAddress } = require('@aragon/templates-shared/lib/ens')(web3, artifacts)
const { getInstalledAppsById } = require('@aragon/templates-shared/helpers/events')(artifacts)
const { assertRole, assertMissingRole, assertRoleNotGranted } = require('@aragon/templates-shared/helpers/assertRole')(web3)

const MembershipTemplate = artifacts.require('MembershipTemplate')

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

contract('Membership', ([_, owner, member1, member2, someone]) => {
  let daoID, template, dao, acl, ens, feed
  let voting, tokenManager, token, finance, agent, vault, payroll

  const MEMBERS = [member1, member2]
  const TOKEN_NAME = 'Member Token'
  const TOKEN_SYMBOL = 'MEMBER'

  const VOTE_DURATION = ONE_WEEK
  const SUPPORT_REQUIRED = 50e16
  const MIN_ACCEPTANCE_QUORUM = 20e16
  const VOTING_SETTINGS = [SUPPORT_REQUIRED, MIN_ACCEPTANCE_QUORUM, VOTE_DURATION]

  const PAYROLL_DENOMINATION_TOKEN = '0x0000000000000000000000000000000000000abc'
  const PAYROLL_RATE_EXPIRY_TIME = THIRTY_DAYS

  before('fetch membership template and ENS', async () => {
    ens = await getENS()
    template = MembershipTemplate.at(await getTemplateAddress())
  })

  const newInstance = (...params) => {
    const lastParam = params[params.length - 1]
    const txParams = (!Array.isArray(lastParam) && typeof lastParam === 'object') ? params.pop() : {}
    const newInstanceFn = MembershipTemplate.abi.find(({ name, inputs }) => name === 'newInstance' && inputs.length === params.length)
    return template.sendTransaction(encodeCall(newInstanceFn, params, txParams))
  }

  const loadDAO = async (tokenReceipt, instanceReceipt, apps = { vault: false, agent: false, payroll: false}) => {
    dao = Kernel.at(getEventArgument(instanceReceipt, 'DeployDao', 'dao'))
    token = MiniMeToken.at(getEventArgument(tokenReceipt, 'DeployToken', 'token'))
    acl = ACL.at(await dao.acl())
    const installedApps = getInstalledAppsById(instanceReceipt)

    assert.equal(dao.address, getEventArgument(instanceReceipt, 'SetupDao', 'dao'), 'should have emitted a SetupDao event')

    assert.equal(installedApps.voting.length, 1, 'should have installed 1 voting app')
    voting = Voting.at(installedApps.voting[0])

    assert.equal(installedApps.finance.length, 1, 'should have installed 1 finance app')
    finance = Finance.at(installedApps.finance[0])

    assert.equal(installedApps['token-manager'].length, 1, 'should have installed 1 token manager app')
    tokenManager = TokenManager.at(installedApps['token-manager'][0])

    if (apps.agent) {
      assert.equal(installedApps.agent.length, 1, 'should have installed 1 agent app')
      agent = Agent.at(installedApps.agent[0])
    }

    if (apps.vault) {
      assert.equal(installedApps.vault.length, 1, 'should have installed 1 vault app')
      vault = Vault.at(installedApps.vault[0])
    }

    if (apps.payroll) {
      assert.equal(installedApps.payroll.length, 1, 'should have installed 1 payroll app')
      payroll = Payroll.at(installedApps.payroll[0])
    }
  }

  const itSetupsDAOCorrectly = financePeriod => {
    it('registers a new DAO on ENS', async () => {
      const aragonIdNameHash = namehash(`${daoID}.aragonid.eth`)
      const resolvedAddress = await PublicResolver.at(await ens.resolver(aragonIdNameHash)).addr(aragonIdNameHash)
      assert.equal(resolvedAddress, dao.address, 'aragonId ENS name does not match')
    })

    it('creates a new token', async () => {
      assert.equal(await token.name(), TOKEN_NAME)
      assert.equal(await token.symbol(), TOKEN_SYMBOL)
      assert.equal(await token.transfersEnabled(), false)
      assert.equal((await token.decimals()).toString(), 0)
    })

    it('mints requested amounts for the members', async () => {
      assert.equal((await token.totalSupply()).toString(), MEMBERS.length)
      for (const holder of MEMBERS) assert.equal((await token.balanceOf(holder)).toString(), 1)
    })

    it('should have voting app correctly setup', async () => {
      assert.isTrue(await voting.hasInitialized(), 'voting not initialized')
      assert.equal((await voting.supportRequiredPct()).toString(), SUPPORT_REQUIRED)
      assert.equal((await voting.minAcceptQuorumPct()).toString(), MIN_ACCEPTANCE_QUORUM)
      assert.equal((await voting.voteTime()).toString(), VOTE_DURATION)

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

      const expectedPeriod = financePeriod === 0 ? THIRTY_DAYS : financePeriod
      assert.equal((await finance.getPeriodDuration()).toString(), expectedPeriod, 'finance period should be 30 days')

      await assertRole(acl, finance, voting, 'CREATE_PAYMENTS_ROLE')
      await assertRole(acl, finance, voting, 'EXECUTE_PAYMENTS_ROLE')
      await assertRole(acl, finance, voting, 'MANAGE_PAYMENTS_ROLE')

      await assertMissingRole(acl, finance, 'CHANGE_PERIOD_ROLE')
      await assertMissingRole(acl, finance, 'CHANGE_BUDGETS_ROLE')
    })

    it('sets up DAO and ACL permissions correctly', async () => {
      await assertRole(acl, dao, voting, 'APP_MANAGER_ROLE')
      await assertRole(acl, acl, voting, 'CREATE_PERMISSIONS_ROLE')

      await assertRoleNotGranted(acl, dao, 'APP_MANAGER_ROLE', template)
      await assertRoleNotGranted(acl, acl, 'CREATE_PERMISSIONS_ROLE', template)
    })

    it('sets up EVM scripts registry permissions correctly', async () => {
      const reg = await EVMScriptRegistry.at(await acl.getEVMScriptRegistry())
      await assertRole(acl, reg, voting, 'REGISTRY_ADD_EXECUTOR_ROLE')
      await assertRole(acl, reg, voting, 'REGISTRY_MANAGER_ROLE')
    })
  }

  const itSetupsAgentAppCorrectly = () => {
    it('should have agent app correctly setup', async () => {
      assert.isTrue(await agent.hasInitialized(), 'agent not initialized')
      assert.equal(await agent.designatedSigner(), ZERO_ADDRESS)

      assert.equal(await dao.recoveryVaultAppId(), APP_IDS.agent, 'agent app is not being used as the vault app of the DAO')
      assert.equal(web3.toChecksumAddress(await finance.vault()), agent.address, 'finance vault is not linked to the agent app')
      assert.equal(web3.toChecksumAddress(await dao.getRecoveryVault()), agent.address, 'agent app is not being used as the vault app of the DAO')

      await assertRole(acl, agent, voting, 'EXECUTE_ROLE')
      await assertRole(acl, agent, voting, 'RUN_SCRIPT_ROLE')
      await assertRole(acl, agent, voting, 'TRANSFER_ROLE', finance)

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

      await assertRole(acl, vault, voting, 'TRANSFER_ROLE', finance)
    })
  }

  const itSetupsPayrollAppCorrectly = employeeManager => {
    it('should have payroll app correctly setup', async () => {
      assert.isTrue(await payroll.hasInitialized(), 'payroll not initialized')
      assert.equal(await payroll.feed(), feed.address)
      assert.equal(await payroll.rateExpiryTime(), PAYROLL_RATE_EXPIRY_TIME)
      assert.equal(await payroll.denominationToken(), PAYROLL_DENOMINATION_TOKEN)
      assert.equal(web3.toChecksumAddress(await payroll.finance()), finance.address)

      await assertRole(acl, finance, voting, 'CREATE_PAYMENTS_ROLE', payroll)
      await assertRoleNotGranted(acl, finance, 'CREATE_PAYMENTS_ROLE', template)

      const expectedGrantee = employeeManager === ZERO_ADDRESS ? voting : { address: employeeManager }

      await assertRole(acl, payroll, voting, 'ADD_BONUS_ROLE', expectedGrantee)
      await assertRole(acl, payroll, voting, 'ADD_EMPLOYEE_ROLE', expectedGrantee)
      await assertRole(acl, payroll, voting, 'ADD_REIMBURSEMENT_ROLE', expectedGrantee)
      await assertRole(acl, payroll, voting, 'TERMINATE_EMPLOYEE_ROLE', expectedGrantee)
      await assertRole(acl, payroll, voting, 'SET_EMPLOYEE_SALARY_ROLE', expectedGrantee)

      await assertRole(acl, payroll, voting, 'MODIFY_PRICE_FEED_ROLE', voting)
      await assertRole(acl, payroll, voting, 'MODIFY_RATE_EXPIRY_ROLE', voting)
      await assertRole(acl, payroll, voting, 'MANAGE_ALLOWED_TOKENS_ROLE', voting)
    })
  }

  context('creating instances with a single transaction', () => {
    context('when the creation fails', () => {
      const FINANCE_PERIOD = 0
      const USE_AGENT_AS_VAULT = true

      it('reverts when no members were given', async () => {
        await assertRevert(template.newTokenAndInstance(TOKEN_NAME, TOKEN_SYMBOL, randomId(), [], VOTING_SETTINGS, FINANCE_PERIOD, USE_AGENT_AS_VAULT), 'MEMBERSHIP_MISSING_MEMBERS')
      })

      it('reverts when an empty id is provided', async () => {
        await assertRevert(template.newTokenAndInstance(TOKEN_NAME, TOKEN_SYMBOL, '', MEMBERS, VOTING_SETTINGS, FINANCE_PERIOD, USE_AGENT_AS_VAULT), 'TEMPLATE_INVALID_ID')
      })
    })

    context('when the creation succeeds', () => {
      let receipt

      const createDAO = (useAgentAsVault = false, financePeriod = 0) => {
        before('create membership entity', async () => {
          daoID = randomId()
          receipt = await template.newTokenAndInstance(TOKEN_NAME, TOKEN_SYMBOL, daoID, MEMBERS, VOTING_SETTINGS, financePeriod, useAgentAsVault, { from: owner })
          await loadDAO(receipt, receipt, { vault: !useAgentAsVault, agent: useAgentAsVault })
        })
      }

      const itCostsUpTo = (expectedCost) => {
        it(`gas costs must be up to ~${expectedCost} gas`, async () => {
          assert.isAtMost(receipt.receipt.gasUsed, expectedCost, `create call should cost up to ${expectedCost} gas`)
        })
      }

      context('when requesting a custom finance period', () => {
        const FINANCE_PERIOD = 60 * 60 * 24 * 15 // 15 days

        context('when requesting an agent app', () => {
          const USE_AGENT_AS_VAULT = true

          createDAO(USE_AGENT_AS_VAULT, FINANCE_PERIOD)
          itCostsUpTo(6.75e6)
          itSetupsDAOCorrectly(FINANCE_PERIOD)
          itSetupsAgentAppCorrectly()
        })

        context('when requesting a vault app', () => {
          const USE_AGENT_AS_VAULT = false

          createDAO(USE_AGENT_AS_VAULT, FINANCE_PERIOD)
          itCostsUpTo(6.6e6)
          itSetupsDAOCorrectly(FINANCE_PERIOD)
          itSetupsVaultAppCorrectly()
        })
      })

      context('when requesting a default finance period', () => {
        const FINANCE_PERIOD = 0 // use default

        context('when requesting an agent app', () => {
          const USE_AGENT_AS_VAULT = true

          createDAO(USE_AGENT_AS_VAULT, FINANCE_PERIOD)
          itCostsUpTo(6.75e6)
          itSetupsDAOCorrectly(FINANCE_PERIOD)
          itSetupsAgentAppCorrectly()
        })

        context('when requesting a vault app', () => {
          const USE_AGENT_AS_VAULT = false

          createDAO(USE_AGENT_AS_VAULT, FINANCE_PERIOD)
          itCostsUpTo(6.6e6)
          itSetupsDAOCorrectly(FINANCE_PERIOD)
          itSetupsVaultAppCorrectly()
        })
      })
    })
  })

  context('creating instances with separated transactions', () => {
    context('when the creation fails', () => {
      const FINANCE_PERIOD = 0
      const USE_AGENT_AS_VAULT = true

      context('when there was no token created before', () => {
        it('reverts', async () => {
          await assertRevert(newInstance(randomId(), MEMBERS, VOTING_SETTINGS, FINANCE_PERIOD, USE_AGENT_AS_VAULT), 'TEMPLATE_MISSING_TOKEN_CACHE')
        })
      })

      context('when there was a token created', () => {
        before('create token', async () => {
          await template.newToken(TOKEN_NAME, TOKEN_SYMBOL)
        })

        it('reverts when no members were given', async () => {
          await assertRevert(newInstance(randomId(), [], VOTING_SETTINGS, FINANCE_PERIOD, USE_AGENT_AS_VAULT), 'MEMBERSHIP_MISSING_MEMBERS')
        })

        it('reverts when an empty id is provided', async () => {
          await assertRevert(newInstance('', MEMBERS, VOTING_SETTINGS, FINANCE_PERIOD, USE_AGENT_AS_VAULT), 'TEMPLATE_INVALID_ID')
        })
      })
    })

    context('when the creation succeeds', () => {
      let instanceReceipt, tokenReceipt

      const itCostsUpTo = (expectedDaoCreationCost) => {
        const expectedTokenCreationCost = 1.8e6
        const expectedTotalCost = expectedTokenCreationCost + expectedDaoCreationCost

        it(`gas costs must be up to ~${expectedTotalCost} gas`, async () => {
          const tokenCreationCost = tokenReceipt.receipt.gasUsed
          assert.isAtMost(tokenCreationCost, expectedTokenCreationCost, `token creation call should cost up to ${tokenCreationCost} gas`)

          const daoCreationCost = instanceReceipt.receipt.gasUsed
          assert.isAtMost(daoCreationCost, expectedDaoCreationCost, `dao creation call should cost up to ${expectedDaoCreationCost} gas`)

          const totalCost = tokenCreationCost + daoCreationCost
          assert.isAtMost(totalCost, expectedTotalCost, `total costs should be up to ${expectedTotalCost} gas`)
        })
      }

      context('when not requesting a payroll app', () => {

        const createDAO = (useAgentAsVault = false, financePeriod = 0) => {
          before('create membership entity without payroll app', async () => {
            daoID = randomId()
            tokenReceipt = await template.newToken(TOKEN_NAME, TOKEN_SYMBOL, { from: owner })
            instanceReceipt = await newInstance(daoID, MEMBERS, VOTING_SETTINGS, financePeriod, useAgentAsVault, { from: owner })
            await loadDAO(tokenReceipt, instanceReceipt, { vault: !useAgentAsVault, agent: useAgentAsVault })
          })
        }

        context('when requesting a custom finance period', () => {
          const FINANCE_PERIOD = 60 * 60 * 24 * 15 // 15 days

          context('when requesting an agent app', () => {
            const USE_AGENT_AS_VAULT = true

            createDAO(USE_AGENT_AS_VAULT, FINANCE_PERIOD)
            itCostsUpTo(5.05e6)
            itSetupsDAOCorrectly(FINANCE_PERIOD)
            itSetupsAgentAppCorrectly()
          })

          context('when requesting a vault app', () => {
            const USE_AGENT_AS_VAULT = false

            createDAO(USE_AGENT_AS_VAULT, FINANCE_PERIOD)
            itCostsUpTo(5e6)
            itSetupsDAOCorrectly(FINANCE_PERIOD)
            itSetupsVaultAppCorrectly()
          })
        })

        context('when requesting a default finance period', () => {
          const FINANCE_PERIOD = 0 // use default

          context('when requesting an agent app', () => {
            const USE_AGENT_AS_VAULT = true

            createDAO(USE_AGENT_AS_VAULT, FINANCE_PERIOD)
            itCostsUpTo(5.05e6)
            itSetupsDAOCorrectly(FINANCE_PERIOD)
            itSetupsAgentAppCorrectly()
          })

          context('when requesting a vault app', () => {
            const USE_AGENT_AS_VAULT = false

            createDAO(USE_AGENT_AS_VAULT, FINANCE_PERIOD)
            itCostsUpTo(5e6)
            itSetupsDAOCorrectly(FINANCE_PERIOD)
            itSetupsVaultAppCorrectly()
          })
        })
      })

      context('when requesting a payroll app', () => {
        const FINANCE_PERIOD = 0
        const USE_AGENT_AS_VAULT = true

        const createDAO = (employeeManager = undefined) => {
          before('create membership entity with payroll app', async () => {
            daoID = randomId()
            feed = await MockContract.new() // has to be a contract
            tokenReceipt = await template.newToken(TOKEN_NAME, TOKEN_SYMBOL, { from: owner })

            const payrollSettings = [PAYROLL_DENOMINATION_TOKEN, feed.address, PAYROLL_RATE_EXPIRY_TIME, employeeManager]
            instanceReceipt = await newInstance(daoID, MEMBERS, VOTING_SETTINGS, FINANCE_PERIOD, USE_AGENT_AS_VAULT, payrollSettings, { from: owner })
            await loadDAO(tokenReceipt, instanceReceipt, { vault: !USE_AGENT_AS_VAULT, agent: USE_AGENT_AS_VAULT, payroll: true })
          })
        }

        context('when requesting a custom employee manager', () => {
          const EMPLOYEE_MANAGER = someone

          createDAO(EMPLOYEE_MANAGER)
          itCostsUpTo(6.23e6)
          itSetupsDAOCorrectly(FINANCE_PERIOD)
          itSetupsAgentAppCorrectly()
          itSetupsPayrollAppCorrectly(EMPLOYEE_MANAGER)
        })

        context('when requesting the default employee manager', () => {
          const EMPLOYEE_MANAGER = ZERO_ADDRESS

          createDAO(EMPLOYEE_MANAGER)
          itCostsUpTo(6.23e6)
          itSetupsDAOCorrectly(FINANCE_PERIOD)
          itSetupsAgentAppCorrectly()
          itSetupsPayrollAppCorrectly(EMPLOYEE_MANAGER)
        })
      })
    })
  })
})
