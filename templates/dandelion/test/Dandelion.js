const encodeCall = require('@aragon/templates-shared/helpers/encodeCall')
const assertRevert = require('@aragon/templates-shared/helpers/assertRevert')(web3)
const BN = require('bn.js')

const { hash: namehash } = require('eth-ens-namehash')
const { randomId } = require('@aragon/templates-shared/helpers/aragonId')
const { getEventArgument } = require('@aragon/test-helpers/events')
const { assertRole, assertMissingRole, assertRoleNotGranted } = require('@aragon/templates-shared/helpers/assertRole')(web3)

// Needed to fork it since we use open.aragonpm.eth domain and need to add Dandelion app Ids
const { APP_IDS } = require('./helpers/apps')
const { getInstalledAppsById } = require('./helpers/events')(artifacts)
const { getENS, getTemplateAddress } = require('./lib/ens')(web3, artifacts)

const DandelionTemplate = artifacts.require('DandelionOrg')
const ACL = artifacts.require('ACL')
const Kernel = artifacts.require('Kernel')
const Agent = artifacts.require('Agent')
const Vault = artifacts.require('Vault')
const Finance = artifacts.require('Finance')
const TokenManager = artifacts.require('TokenManager')
const MiniMeToken = artifacts.require('MiniMeToken')
const PublicResolver = artifacts.require('PublicResolver')
const EVMScriptRegistry = artifacts.require('EVMScriptRegistry')
const ERC20 = artifacts.require('ERC20Sample')

// Dandelion apps
const DandelionVoting = artifacts.require('DandelionVoting')
const Redemptions = artifacts.require('Redemptions')
const TimeLock = artifacts.require('TimeLock')
const TokenRequest = artifacts.require('TokenRequest')
const TokenBalanceOracle = artifacts.require('TokenBalanceOracle')


const BLOCK_TIME = 15
const ONE_HOUR = 60 * 60
const ONE_DAY = ONE_HOUR * 24
const ONE_WEEK = ONE_DAY * 7
const THIRTY_DAYS = ONE_DAY * 30
const ZERO_ADDRESS = '0x'.padEnd(42, '0')
const ANY_ENTITY = '0x'.padEnd(42, 'f')

const bigExp = (x, y = 0) => new BN(x).mul(new BN(10).pow(new BN(y)));
const pct16 = x => bigExp(x, 16);

contract('Dandelion', ([_, owner, holder1, holder2, notHolder, someone]) => {
  let daoID, template, dao, acl, ens
  let tokenManager, token, finance, agent, vault
  let dandelionVoting, redemptions, tokenRequest, timeLock, tokenBalanceOracle

  const HOLDERS = [holder1, holder2]
  const STAKES = HOLDERS.map(() => 1e18)
  const TOKEN_NAME = 'Bee Token'
  const TOKEN_SYMBOL = 'BEE'

  const SUPPORT_REQUIRED = bigExp(50, 16)
  const MIN_ACCEPTANCE_QUORUM = bigExp(5, 16)
  const VOTE_DURATION = Math.round(ONE_WEEK / BLOCK_TIME)
  const VOTE_BUFFER = Math.round(ONE_DAY / BLOCK_TIME)
  const VOTE_DELAY = Math.round(ONE_HOUR / BLOCK_TIME)


  // Time Lock settings
  const LOCK_AMOUNT = bigExp(10);
  const LOCK_DURATION = 60; // seconds
  const SPAM_PENALTY_FACTOR = pct16(50); // 50%

  const REDEEMABLE_TOKENS = [ZERO_ADDRESS]
  const ACCEPTED_DEPOSIT_TOKENS = [ZERO_ADDRESS]
  const TIME_LOCK_SETTINGS = [LOCK_DURATION, LOCK_AMOUNT, SPAM_PENALTY_FACTOR]
  const VOTING_SETTINGS = [SUPPORT_REQUIRED, MIN_ACCEPTANCE_QUORUM, VOTE_DURATION, VOTE_BUFFER, VOTE_DELAY]

  before('fetch Dandelion template and ENS', async () => {
    ens = await getENS()
    template = DandelionTemplate.at(await getTemplateAddress())
  })

  const newTokenAndBaseInstance = (...params) => {
    const lastParam = params[params.length - 1]
    const txParams = (!Array.isArray(lastParam) && typeof lastParam === 'object') ? params.pop() : {}
    const newInstanceFn = DandelionTemplate.abi.find(({ name, inputs }) => name === 'newTokenAndBaseInstance' && inputs.length === params.length)
    return template.sendTransaction(encodeCall(newInstanceFn, params, txParams))
  }

  const installDandelionApps = (...params) => {
    const lastParam = params[params.length - 1]
    const txParams = (!Array.isArray(lastParam) && typeof lastParam === 'object') ? params.pop() : {}
    const newInstanceFn = DandelionTemplate.abi.find(({ name, inputs }) => name === 'installDandelionApps' && inputs.length === params.length)
    return template.sendTransaction(encodeCall(newInstanceFn, params, txParams))
  }

  const loadDAO = async (tokenReceipt, instanceReceipt, dandelionAppsReceipt, apps = { vault: false, agent: false }) => {
    dao = Kernel.at(getEventArgument(instanceReceipt, 'DeployDao', 'dao'))
    token = MiniMeToken.at(getEventArgument(tokenReceipt, 'DeployToken', 'token'))
    acl = ACL.at(await dao.acl())

    const installedBaseApps = getInstalledAppsById(instanceReceipt)
    const installedDandelionApps = getInstalledAppsById(dandelionAppsReceipt)
    const installedApps = { ...installedBaseApps, ...installedDandelionApps }

    assert.equal(dao.address, getEventArgument(dandelionAppsReceipt, 'SetupDao', 'dao'), 'should have emitted a SetupDao event')

    // Base apps
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

    // Dandelion apps
    assert.equal(installedApps['dandelion-voting'].length, 1, 'should have installed 1 dandelion voting app')
    dandelionVoting = DandelionVoting.at(installedApps['dandelion-voting'][0])

    assert.equal(installedApps['redemptions'].length, 1, 'should have installed 1 redemptions app')
    redemptions = Redemptions.at(installedApps['redemptions'][0])

    assert.equal(installedApps['token-request'].length, 1, 'should have installed 1 token request app')
    tokenRequest = TokenRequest.at(installedApps['token-request'][0])

    assert.equal(installedApps['time-lock'].length, 1, 'should have installed 1 time lock app')
    timeLock = TimeLock.at(installedApps['time-lock'][0])

    assert.equal(installedApps['token-balance-oracle'].length, 1, 'should have installed 1 token balance oracle app')
    tokenBalanceOracle = TokenBalanceOracle.at(installedApps['token-balance-oracle'][0])
  }

  const itSetupsDAOCorrectly = (agentAsVault, financePeriod) => {
    it('registers a new DAO on ENS', async () => {
      const aragonIdNameHash = namehash(`${daoID}.aragonid.eth`)
      const resolvedAddress = await PublicResolver.at(await ens.resolver(aragonIdNameHash)).addr(aragonIdNameHash)
      assert.equal(resolvedAddress, dao.address, 'aragonId ENS name does not match')
    })

    it('creates a new token', async () => {
      assert.equal(await token.name(), TOKEN_NAME)
      assert.equal(await token.symbol(), TOKEN_SYMBOL)
      assert.equal(await token.transfersEnabled(), false)
      assert.equal((await token.decimals()).toString(), 18)
    })

    it('mints requested amounts for the holders', async () => {
      assert.equal((await token.totalSupply()).toString(), STAKES.reduce((a, b) => a + b))
      for (const holder of HOLDERS) assert.equal((await token.balanceOf(holder)).toString(), STAKES[HOLDERS.indexOf(holder)])
    })

    // Base apps tests
    it('should have token manager app correctly setup', async () => {
      assert.isTrue(await tokenManager.hasInitialized(), 'token manager not initialized')
      assert.equal(await tokenManager.token(), token.address)

      await assertRole(acl, tokenManager, dandelionVoting, 'MINT_ROLE', tokenRequest)
      await assertRole(acl, tokenManager, dandelionVoting, 'BURN_ROLE', redemptions)

      await assertMissingRole(acl, tokenManager, 'ISSUE_ROLE')
      await assertMissingRole(acl, tokenManager, 'ASSIGN_ROLE')
      await assertMissingRole(acl, tokenManager, 'REVOKE_VESTINGS_ROLE')
    })

    it('should have finance app correctly setup', async () => {
      assert.isTrue(await finance.hasInitialized(), 'finance not initialized')

      const expectedPeriod = financePeriod === 0 ? THIRTY_DAYS : financePeriod
      assert.equal((await finance.getPeriodDuration()).toString(), expectedPeriod, 'finance period should be 30 days')

      await assertRole(acl, finance, dandelionVoting, 'CREATE_PAYMENTS_ROLE')
      await assertRole(acl, finance, dandelionVoting, 'EXECUTE_PAYMENTS_ROLE')
      await assertRole(acl, finance, dandelionVoting, 'MANAGE_PAYMENTS_ROLE')

      await assertMissingRole(acl, finance, 'CHANGE_PERIOD_ROLE')
      await assertMissingRole(acl, finance, 'CHANGE_BUDGETS_ROLE')
    })

    // Dandelion apps tests
    it('should have dandelion voting app correctly setup', async () => {
      assert.isTrue(await dandelionVoting.hasInitialized(), 'voting not initialized')
      assert.equal((await dandelionVoting.supportRequiredPct()).toString(), SUPPORT_REQUIRED)
      assert.equal((await dandelionVoting.minAcceptQuorumPct()).toString(), MIN_ACCEPTANCE_QUORUM)
      assert.equal((await dandelionVoting.durationBlocks()).toString(), VOTE_DURATION)
      assert.equal((await dandelionVoting.bufferBlocks()).toString(), VOTE_BUFFER)
      assert.equal((await dandelionVoting.executionDelayBlocks()).toString(), VOTE_DELAY)

      await assertRole(acl, dandelionVoting, dandelionVoting, 'CREATE_VOTES_ROLE', timeLock)
      await assertRole(acl, dandelionVoting, dandelionVoting, 'MODIFY_QUORUM_ROLE')
      await assertRole(acl, dandelionVoting, dandelionVoting, 'MODIFY_SUPPORT_ROLE')
    })

    it('should have redemptions app correctly setup', async () => {
      const agentOrVault = agentAsVault ? agent : vault

      assert.isTrue(await redemptions.hasInitialized(), 'redemptions not initialized')
      assert.deepStrictEqual(await redemptions.getRedeemableTokens(), REDEEMABLE_TOKENS)
      assert.equal(web3.toChecksumAddress(await redemptions.tokenManager()), tokenManager.address, 'token manager not linked to redemptions app')
      assert.equal(web3.toChecksumAddress(await redemptions.vault()), agentOrVault.address, 'vault not linked to redemptions app')

      await assertRole(acl, redemptions, dandelionVoting, 'ADD_TOKEN_ROLE')
      await assertRole(acl, redemptions, dandelionVoting, 'REMOVE_TOKEN_ROLE')
      await assertRole(acl, redemptions, dandelionVoting, 'REDEEM_ROLE', { address: ANY_ENTITY }) // TODO: check oracle
    })

    it('should have token request app correctly setup', async () => {
      const agentOrVault = agentAsVault ? agent : vault

      assert.isTrue(await tokenRequest.hasInitialized(), 'token request not initialized')
      assert.deepStrictEqual(await tokenRequest.getAcceptedDepositTokens(), ACCEPTED_DEPOSIT_TOKENS)
      assert.equal(web3.toChecksumAddress(await tokenRequest.tokenManager()), tokenManager.address, 'token manager not linked to token request app')
      assert.equal(web3.toChecksumAddress(await tokenRequest.vault()), agentOrVault.address, 'vault not linked to token request app')

      await assertRole(acl, tokenRequest, dandelionVoting, 'SET_TOKEN_MANAGER_ROLE')
      await assertRole(acl, tokenRequest, dandelionVoting, 'SET_VAULT_ROLE')
      await assertRole(acl, tokenRequest, dandelionVoting, 'MODIFY_TOKENS_ROLE')
      await assertRole(acl, tokenRequest, dandelionVoting, 'FINALISE_TOKEN_REQUEST_ROLE')
    })

    it('should have time lock app correctly setup', async () => {
      assert.isTrue(await timeLock.hasInitialized(), 'token request not initialized')
      assert.equal(await timeLock.lockDuration(), LOCK_DURATION)
      assert.equal((await timeLock.lockAmount()).toString(), bigExp(10, 18)) // TODO: Change to LOCK_AMOUNT once it's fixed in the contract
      assert.equal((await timeLock.spamPenaltyFactor()).toString(), SPAM_PENALTY_FACTOR)

      await assertRole(acl, timeLock, dandelionVoting, 'CHANGE_DURATION_ROLE')
      await assertRole(acl, timeLock, dandelionVoting, 'CHANGE_AMOUNT_ROLE')
      await assertRole(acl, timeLock, dandelionVoting, 'CHANGE_SPAM_PENALTY_ROLE')

      // TODO: Add checks for permission with params
      // await assertRole(acl, timeLock, dandelionVoting, 'LOCK_TOKENS_ROLE', { address: ANY_ENTITY }, [new BN(holder1, 16)])
      // await assertRoleNotGranted(acl, timeLock, dandelionVoting, 'LOCK_TOKENS_ROLE', { address: noHolder })
    })

    it('should have token oracle app correctly setup', async () => {
      assert.isTrue(await tokenBalanceOracle.hasInitialized(), 'token oracle not initialized')
      assert.equal(web3.toChecksumAddress(await tokenBalanceOracle.token()), web3.toChecksumAddress(await tokenManager.token()))
      assert.equal((await tokenBalanceOracle.minBalance()).toString(), bigExp(1, 18))

      await assertRole(acl, tokenBalanceOracle, dandelionVoting, 'SET_TOKEN_ROLE')
      await assertRole(acl, tokenBalanceOracle, dandelionVoting, 'SET_MIN_BALANCE_ROLE')
    })

    // General permissions tests
    it('sets up DAO and ACL permissions correctly', async () => {
      await assertRole(acl, dao, dandelionVoting, 'APP_MANAGER_ROLE')
      await assertRole(acl, acl, dandelionVoting, 'CREATE_PERMISSIONS_ROLE')

      await assertRoleNotGranted(acl, dao, 'APP_MANAGER_ROLE', template)
      await assertRoleNotGranted(acl, acl, 'CREATE_PERMISSIONS_ROLE', template)
    })

    it('sets up EVM scripts registry permissions correctly', async () => {
      const reg = await EVMScriptRegistry.at(await acl.getEVMScriptRegistry())
      await assertRole(acl, reg, dandelionVoting, 'REGISTRY_ADD_EXECUTOR_ROLE')
      await assertRole(acl, reg, dandelionVoting, 'REGISTRY_MANAGER_ROLE')
    })
  }

  const itSetupsAgentAppCorrectly = () => {
    it('should have agent app correctly setup', async () => {
      assert.isTrue(await agent.hasInitialized(), 'agent not initialized')
      assert.equal(await agent.designatedSigner(), ZERO_ADDRESS)

      assert.equal(await dao.recoveryVaultAppId(), APP_IDS.agent, 'agent app is not being used as the vault app of the DAO')
      assert.equal(web3.toChecksumAddress(await finance.vault()), agent.address, 'finance vault is not linked to the agent app')
      assert.equal(web3.toChecksumAddress(await dao.getRecoveryVault()), agent.address, 'agent app is not being used as the vault app of the DAO')

      await assertRole(acl, agent, dandelionVoting, 'EXECUTE_ROLE')
      await assertRole(acl, agent, dandelionVoting, 'RUN_SCRIPT_ROLE')
      await assertRole(acl, agent, dandelionVoting, 'TRANSFER_ROLE', finance)

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

      await assertRole(acl, vault, dandelionVoting, 'TRANSFER_ROLE', finance)
      await assertRole(acl, vault, dandelionVoting, 'TRANSFER_ROLE', redemptions)
      await assertRoleNotGranted(acl, vault, 'TRANSFER_ROLE', template)
    })
  }

  // newToken and newBaseInstance in one transaction
  context('creating instances with two transactions', () => {
    context('when the creation fails', () => {
      const FINANCE_PERIOD = 0
      const USE_AGENT_AS_VAULT = true

      it('reverts when no holders were given', async () => {
        await assertRevert(newTokenAndBaseInstance(TOKEN_NAME, TOKEN_SYMBOL, [], [], FINANCE_PERIOD, USE_AGENT_AS_VAULT), 'DANDELION_EMPTY_HOLDERS')
      })

      it('reverts when holders and stakes length do not match', async () => {
        await assertRevert(newTokenAndBaseInstance(TOKEN_NAME, TOKEN_SYMBOL, [holder1], STAKES, FINANCE_PERIOD, USE_AGENT_AS_VAULT), 'DANDELION_BAD_HOLDERS_STAKES_LEN')
        await assertRevert(newTokenAndBaseInstance(TOKEN_NAME, TOKEN_SYMBOL, HOLDERS, [1e18], FINANCE_PERIOD, USE_AGENT_AS_VAULT), 'DANDELION_BAD_HOLDERS_STAKES_LEN')
      })

      it('reverts when an empty id is provided', async () => {
        const timeLockToken = await ERC20.new(owner, "Lock Token", "LKT");
        newTokenAndBaseInstance(TOKEN_NAME, TOKEN_SYMBOL, HOLDERS, STAKES, FINANCE_PERIOD, USE_AGENT_AS_VAULT)
        await assertRevert(installDandelionApps(
          '',
          REDEEMABLE_TOKENS,
          ACCEPTED_DEPOSIT_TOKENS,
          timeLockToken.address,
          TIME_LOCK_SETTINGS,
          VOTING_SETTINGS,
          { from: owner }
        ), 'TEMPLATE_INVALID_ID')
      })
    })

    context('when the creation succeeds', () => {
      let instanceReceipt, dandelionAppsReceipt, timeLockToken

      const itCostsUpTo = (expectedDaoCreationCost, expectedDandelionAppsInstallationCost) => {
        const expectedTotalCost = expectedDaoCreationCost + expectedDandelionAppsInstallationCost

        it(`gas costs must be up to ~${expectedTotalCost} gas`, async () => {

          const daoCreationCost = instanceReceipt.receipt.gasUsed
          assert.isAtMost(daoCreationCost, expectedDaoCreationCost, `dao creation call should cost up to ${expectedDaoCreationCost} gas`)

          const dandelionAppsInstallationCost = dandelionAppsReceipt.receipt.gasUsed
          assert.isAtMost(dandelionAppsInstallationCost, expectedDandelionAppsInstallationCost, `install dandelion apps call should cost up to ${expectedDandelionAppsInstallationCost} gas`)

          const totalCost = daoCreationCost + dandelionAppsInstallationCost
          assert.isAtMost(totalCost, expectedTotalCost, `total costs should be up to ${expectedTotalCost} gas`)
        })
      }

      const createDAO = (useAgentAsVault = false, financePeriod = 0) => {
        before('create Dandelion', async () => {
          timeLockToken = await ERC20.new(owner, "Lock Token", "LKT");
          daoID = randomId()
          instanceReceipt = await newTokenAndBaseInstance(TOKEN_NAME, TOKEN_SYMBOL, HOLDERS, STAKES, financePeriod, useAgentAsVault, { from: owner })
          dandelionAppsReceipt = await installDandelionApps(
            daoID,
            REDEEMABLE_TOKENS,
            ACCEPTED_DEPOSIT_TOKENS,
            timeLockToken.address,
            TIME_LOCK_SETTINGS,
            VOTING_SETTINGS,
            { from: owner }
          )
          await loadDAO(instanceReceipt, instanceReceipt, dandelionAppsReceipt, { vault: !useAgentAsVault, agent: useAgentAsVault })
        })
      }

      context('when requesting a custom finance period', () => {
        const FINANCE_PERIOD = 60 * 60 * 24 * 15 // 15 days

        context('when requesting an agent app', () => {
          const USE_AGENT_AS_VAULT = true

          createDAO(USE_AGENT_AS_VAULT, FINANCE_PERIOD)
          itCostsUpTo(5.08e6, 5.3e6)
          itSetupsDAOCorrectly(USE_AGENT_AS_VAULT, FINANCE_PERIOD)
          itSetupsAgentAppCorrectly()
        })

        context('when requesting a vault app', () => {
          const USE_AGENT_AS_VAULT = false

          createDAO(USE_AGENT_AS_VAULT, FINANCE_PERIOD)
          itCostsUpTo(5.06e6, 5.3e6)
          itSetupsDAOCorrectly(USE_AGENT_AS_VAULT, FINANCE_PERIOD)
          itSetupsVaultAppCorrectly()
        })
      })

      context('when requesting a default finance period', () => {
        const FINANCE_PERIOD = 0 // use default

        context('when requesting an agent app', () => {
          const USE_AGENT_AS_VAULT = true

          createDAO(USE_AGENT_AS_VAULT, FINANCE_PERIOD)
          itCostsUpTo(5.08e6, 5.3e6)
          itSetupsDAOCorrectly(USE_AGENT_AS_VAULT, FINANCE_PERIOD)
          itSetupsAgentAppCorrectly()
        })

        context('when requesting a vault app', () => {
          const USE_AGENT_AS_VAULT = false

          createDAO(USE_AGENT_AS_VAULT, FINANCE_PERIOD)
          itCostsUpTo(5.06e6, 5.3e6)
          itSetupsDAOCorrectly(USE_AGENT_AS_VAULT, FINANCE_PERIOD)
          itSetupsVaultAppCorrectly()
        })
      })
    })
  })
})