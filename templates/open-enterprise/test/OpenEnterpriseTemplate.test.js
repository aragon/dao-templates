/* global artifacts, assert, before, context, contract, it, web3 */
const { hash: namehash } = require('eth-ens-namehash')
const encodeCall = require('@aragon/templates-shared/helpers/encodeCall')
const assertRevert = require('@aragon/templates-shared/helpers/assertRevert')(web3)
const { randomId } = require('@aragon/templates-shared/helpers/aragonId')
const { assertRole, assertMissingRole, assertRoleNotGranted } = require('@aragon/templates-shared/helpers/assertRole')(web3)
const { getEventArgument } = require('@aragon/test-helpers/events')


// Needed to fork and customize these dependencies from "@aragon/templates-shared"
const { APP_IDS } = require('../temp/helpers/apps')
const { getENS, getTemplateAddress } = require('../temp/lib/ens')(web3, artifacts)
const { getInstalledAppsById } = require('../temp/helpers/events')(artifacts)

const OpenEnterpriseTemplate = artifacts.require('OpenEnterpriseTemplate')
const ACL = artifacts.require('ACL')
const Kernel = artifacts.require('Kernel')
const Vault = artifacts.require('Vault')
const Voting = artifacts.require('Voting')
const Finance = artifacts.require('Finance')
const TokenManager = artifacts.require('TokenManager')
const MiniMeToken = artifacts.require('MiniMeToken')
const PublicResolver = artifacts.require('PublicResolver')
const EVMScriptRegistry = artifacts.require('EVMScriptRegistry')

// Open Enterprise Apps
const AddressBook = artifacts.require('AddressBook')
const Allocations = artifacts.require('Allocations')
const Discussions = artifacts.require('DiscussionApp')
const DotVoting = artifacts.require('DotVoting')
const Projects = artifacts.require('Projects')
const Rewards = artifacts.require('Rewards')

const ONE_DAY = 60 * 60 * 24
const ONE_WEEK = ONE_DAY * 7
const THIRTY_DAYS = ONE_DAY * 30
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

// TODO: Test permissions removed from deployer, specially vault
// TODO: Test different token amounts, even very large amounts
contract('OpenEnterpriseTemplate', ([ owner, member1, member2 ]) => {
  let daoID, template, dao, acl, ens, feed
  let voting, tokenManager, token, finance, vault
  let addressBook, allocations, discussions, dotVoting, projects, rewards

  const MEMBERS = [ member1, member2 ]
  const STAKES = [ 1, 1 ]
  const TOKEN_NAME = 'Autark Token'
  const TOKEN_SYMBOL = 'AUT'

  const VOTE_DURATION = ONE_WEEK
  const SUPPORT_REQUIRED = 50e16
  const MIN_ACCEPTANCE_QUORUM = 20e16
  const VOTING_SETTINGS = [ SUPPORT_REQUIRED, MIN_ACCEPTANCE_QUORUM, VOTE_DURATION ]
  const DOT_VOTING_SETTINGS = [ SUPPORT_REQUIRED, MIN_ACCEPTANCE_QUORUM, VOTE_DURATION ]

  before('fetch open enterprise template and ENS', async () => {
    ens = await getENS()
    template = OpenEnterpriseTemplate.at(await getTemplateAddress())
  })

  const newOpenEnterprise = async (...params) => {
    const lastParam = params[params.length - 1]
    const txParams = (!Array.isArray(lastParam) && typeof lastParam === 'object') ? params.pop() : {}
    const newOpenEnterpriseFn = OpenEnterpriseTemplate.abi.find(({ name, inputs }) => name === 'newOpenEnterprise' && inputs.length === params.length)
    return await template.sendTransaction(encodeCall(newOpenEnterpriseFn, params, txParams))
  }

  const loadDAO = async (baseDAO, baseOpenEnterprise, apps = { discussions: false } ) => {
    dao = Kernel.at(getEventArgument(baseDAO, 'DeployDao', 'dao'))

    token = MiniMeToken.at(getEventArgument(baseDAO, 'DeployToken', 'token'))
    acl = ACL.at(await dao.acl())
    const oeApps = getInstalledAppsById(baseOpenEnterprise)
    const installedApps = { ...getInstalledAppsById(baseDAO),
                            'address-book': oeApps['address-book'],
                            allocations: oeApps['allocations'],
                            discussions: oeApps['discussions'],
                            'dot-voting': oeApps['dot-voting'],
                            projects: oeApps['projects'],
                            rewards: oeApps['rewards'] }
    assert.equal(dao.address, getEventArgument(baseDAO, 'DeployDao', 'dao'), 'should have emitted a SetupDao event')

    assert.equal(installedApps.voting.length, 1, 'should have installed 1 voting app')
    voting = Voting.at(installedApps.voting[0])

    assert.equal(installedApps.finance.length, 1, 'should have installed 1 finance app')
    finance = Finance.at(installedApps.finance[0])

    assert.equal(installedApps['token-manager'].length, 1, 'should have installed 1 token manager app')
    tokenManager = TokenManager.at(installedApps['token-manager'][0])

    assert.equal(installedApps.vault.length, 1, 'should have installed 1 vault app')
    vault = Vault.at(installedApps.vault[0])

    assert.equal(installedApps['address-book'].length, 1, 'should have installed 1 address book app')
    addressBook = AddressBook.at(installedApps['address-book'][0])

    assert.equal(installedApps.allocations.length, 1, 'should have installed 1 allocations app')
    allocations = Allocations.at(installedApps.allocations[0])

    assert.equal(installedApps['dot-voting'].length, 1, 'should have installed 1 dot voting app')
    dotVoting = DotVoting.at(installedApps['dot-voting'][0])

    assert.equal(installedApps.projects.length, 1, 'should have installed 1 projects app')
    projects = Projects.at(installedApps.projects[0])

    assert.equal(installedApps.rewards.length, 1, 'should have installed 1 rewards app')
    rewards = Rewards.at(installedApps.rewards[0])

    if (apps.discussions) {
      assert.equal(installedApps.discussions.length, 1, 'should have installed 1 discussions app')
      discussions = Discussions.at(installedApps.discussions[0])
    }
  }

  const itSetupsDAOCorrectly = (financePeriod) => {
    it('registers a new DAO on ENS', async () => {
      const aragonIdNameHash = namehash(`${daoID}.aragonid.eth`)
      const resolvedAddress = await PublicResolver.at(await ens.resolver(aragonIdNameHash)).addr(aragonIdNameHash)
      assert.equal(resolvedAddress, dao.address, 'aragonId ENS name does not match')
    })

    it('creates a new token', async () => {
      assert.equal(await token.name(), TOKEN_NAME)
      assert.equal(await token.symbol(), TOKEN_SYMBOL)
      assert.equal(await token.transfersEnabled(), true)
      assert.equal((await token.decimals()).toString(), 18)
    })

    it('mints requested amounts for the members', async () => {
      assert.equal((await token.totalSupply()).toString(), MEMBERS.length)
      for (const holder of MEMBERS) assert.equal((await token.balanceOf(holder)).toString(), 1)
    })

    it('should have voting app correctly setup', async () => {
      assert.isTrue(await voting.hasInitialized(), 'voting not initialized')
      // assert.equal((await voting.supportRequiredPct()).toString(), SUPPORT_REQUIRED)
      // assert.equal((await voting.minAcceptQuorumPct()).toString(), MIN_ACCEPTANCE_QUORUM)
      // assert.equal((await voting.voteTime()).toString(), VOTE_DURATION)

      // await assertRole(acl, voting, voting, 'CREATE_VOTES_ROLE', tokenManager)
      // await assertRole(acl, voting, voting, 'MODIFY_QUORUM_ROLE')
      // await assertRole(acl, voting, voting, 'MODIFY_SUPPORT_ROLE')
    })

    it('should have token manager app correctly setup', async () => {
      assert.isTrue(await tokenManager.hasInitialized(), 'token manager not initialized')
      assert.equal(await tokenManager.token(), token.address)

      // await assertRole(acl, tokenManager, voting, 'MINT_ROLE')
      // await assertRole(acl, tokenManager, voting, 'BURN_ROLE')

      // await assertMissingRole(acl, tokenManager, 'ISSUE_ROLE')
      // await assertMissingRole(acl, tokenManager, 'ASSIGN_ROLE')
      // await assertMissingRole(acl, tokenManager, 'REVOKE_VESTINGS_ROLE')
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

    it('should have address book app correctly setup', async () => {
      // TODO: This seems a bug from aragonOS?
      await addressBook.initialize()
      assert.isTrue(await addressBook.hasInitialized(), 'address book not initialized')

      // TODO: Check roles for each app
      // await assertRole(acl, addressBook, voting, 'ADD_ENTRY_ROLE')
      // await assertRole(acl, addressBook, voting, 'REMOVE_ENTRY_ROLE')
      // await assertRole(acl, finance, voting, 'MANAGE_PAYMENTS_ROLE')

      //await assertMissingRole(acl, addressBook, 'UPDATE_ENTRY_ROLE')
      // await assertMissingRole(acl, finance, 'CHANGE_BUDGETS_ROLE')
    })

    it('should have allocations app correctly setup', async () => {
      assert.isTrue(await allocations.hasInitialized(), 'allocations not initialized')

      // TODO: Check roles for each app
      // await assertRole(acl, finance, voting, 'CREATE_PAYMENTS_ROLE')
    })

    it('should have dot voting app correctly setup', async () => {
      assert.isTrue(await dotVoting.hasInitialized(), 'dot voting not initialized')

      // TODO: Check roles for each app
      // await assertRole(acl, finance, voting, 'CREATE_PAYMENTS_ROLE')
    })

    it('should have projects app correctly setup', async () => {
      assert.isTrue(await projects.hasInitialized(), 'projects not initialized')

      // TODO: Check roles for each app
      // await assertRole(acl, finance, voting, 'CREATE_PAYMENTS_ROLE')
      // await assertRole(acl, finance, voting, 'EXECUTE_PAYMENTS_ROLE')
      // await assertRole(acl, finance, voting, 'MANAGE_PAYMENTS_ROLE')

      // await assertMissingRole(acl, finance, 'CHANGE_PERIOD_ROLE')
      // await assertMissingRole(acl, finance, 'CHANGE_BUDGETS_ROLE')
    })

    it('should have rewards app correctly setup', async () => {
      assert.isTrue(await rewards.hasInitialized(), 'rewards not initialized')

      // TODO: Check roles for each app
      // await assertRole(acl, finance, voting, 'CREATE_PAYMENTS_ROLE')
      // await assertRole(acl, finance, voting, 'EXECUTE_PAYMENTS_ROLE')
      // await assertRole(acl, finance, voting, 'MANAGE_PAYMENTS_ROLE')

      // await assertMissingRole(acl, finance, 'CHANGE_PERIOD_ROLE')
      // await assertMissingRole(acl, finance, 'CHANGE_BUDGETS_ROLE')
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

  const itSetupsVaultAppCorrectly = () => {
    it('should have vault app correctly setup', async () => {
      assert.isTrue(await vault.hasInitialized(), 'vault not initialized')
      assert.equal(await dao.recoveryVaultAppId(), APP_IDS.vault, 'vault app is not being used as the vault app of the DAO')
      /*assert.equal(web3.toChecksumAddress(await finance.vault()), vault.address, 'finance vault is not the vault app')
      assert.equal(web3.toChecksumAddress(await dao.getRecoveryVault()), vault.address, 'vault app is not being used as the vault app of the DAO')

      await assertRole(acl, vault, voting, 'TRANSFER_ROLE', finance)
      */
    })
  }

  const itSetupsDiscussionsAppCorrectly = () => {
    it('should have discussions app correctly setup', async () => {
      // assert.isTrue(await discussions.hasInitialized(), 'discussions not initialized')

      // TODO: extra assertions here
      // assert.equal(await discussions.feed(), feed.address)
      // assert.equal(await discussions.rateExpiryTime(), DISCUSSIONS_RATE_EXPIRY_TIME)
      // assert.equal(await discussions.denominationToken(), DISCUSSIONS_DENOMINATION_TOKEN)
      // assert.equal(web3.toChecksumAddress(await discussions.finance()), finance.address)

      // TODO: assert roles from here
      // await assertRole(acl, finance, voting, 'CREATE_PAYMENTS_ROLE', discussions)
      // await assertRoleNotGranted(acl, finance, 'CREATE_PAYMENTS_ROLE', template)

      // const expectedGrantee = ZERO_ADDRESS // TODO: This should be any address

      // await assertRole(acl, discussions, voting, 'ADD_BONUS_ROLE', expectedGrantee)
    })
  }

  // TODO: add info to README: It is currently not possible to create instances of this template with a single transaction because of gas limitations
  context('creating instances with separated transactions', () => {
    context('when the creation fails', () => {
      const DEFAULT_PERIOD = 0
      const USE_DISCUSSIONS = true

      context('when there was no token created before', () => {
        //Is supposed to return 'TEMPLATE_MISSING_TOKEN_CACHE' in the revert message but doesn't
        it('reverts', async () => {
          return assertRevert(async () => {
            await newOpenEnterprise(DOT_VOTING_SETTINGS, DEFAULT_PERIOD, USE_DISCUSSIONS)
          })
        })
      })

      context('when there was a token created', () => {
        before('create token', async () => {
          await template.newToken(TOKEN_NAME, TOKEN_SYMBOL)
        })

        // it('reverts when no members were given', async () => {
        //   await assertRevert(newOpenEnterprise(DOT_VOTING_SETTINGS, DEFAULT_PERIOD, USE_DISCUSSIONS), 'OPEN_ENTERPRISE_MISSING_MEMBERS')
        // })

        // it('reverts when an empty id is provided', async () => {
        //   await assertRevert(newOpenEnterprise(DOT_VOTING_SETTINGS, DEFAULT_PERIOD, USE_DISCUSSIONS), 'TEMPLATE_INVALID_ID')
        // })
      })
    })

    context('when the creation succeeds', () => {
      let instanceReceipt, tokenReceipt, baseDAO, baseOpenEnterprise

      const itCostsUpTo = expectedDaoCreationCost => {
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

      const createDAO = (useDiscussions = false, periods = [ 0, 0 ]) => {
        before('create open enterprise entity', async () => {
          daoID = randomId()
          baseDAO = await template.newTokenAndInstance(TOKEN_NAME, TOKEN_SYMBOL, daoID, MEMBERS, STAKES, VOTING_SETTINGS, periods[0])
          baseOpenEnterprise = await template.newOpenEnterprise(VOTING_SETTINGS, periods[1], useDiscussions)
          await loadDAO(baseDAO, baseOpenEnterprise, { discussions: useDiscussions })
        })
      }

      const createBaseDAO = () => {
        daoID = randomId()
        it('should create token, dao and base apps', async () => {
          baseDAO = await template.newTokenAndInstance(TOKEN_NAME, TOKEN_SYMBOL, daoID, MEMBERS, STAKES, VOTING_SETTINGS, 0, { from: owner })
          // Costs for token and dao 3249295 -> token, dao and acl
          // Costs for token and dao 3344131 -> create id
          // Costs for token and dao 3771214 -> add vault
          // Costs for token and dao 6505129 -> add core apps, permissions, mint tokens, cache
        })
      }

      const setupOpenEnterprise = () => {
        daoID = randomId()
        it('should setup open enterprise correctly', async () => {
          baseOpenEnterprise = await template.newOpenEnterprise(VOTING_SETTINGS, 0, false, { from: owner })
          // Costs for newOpenEnterprise call: 2798046 gas -> all apps
        })
      }

      context('when requesting a custom finance period', () => {
        const PERIODS = Array(2).fill(60 * 60 * 24 * 15) // 15 days

        context('when requesting a discussions app', () => {
          const USE_DISCUSSIONS = true

          createDAO(USE_DISCUSSIONS, PERIODS)
          //itCostsUpTo(5.05e6)
          itSetupsDAOCorrectly(...PERIODS)
          itSetupsDiscussionsAppCorrectly()
        })

        context('when requesting a vault app', () => {
          const USE_DISCUSSIONS = false

          createDAO(USE_DISCUSSIONS, PERIODS)
          //itCostsUpTo(5e6)
          itSetupsDAOCorrectly(...PERIODS)
          itSetupsVaultAppCorrectly()
        })
      })

      context('when requesting a default finance period', () => {
        const PERIODS = Array(2).fill(0) // use default

        context('when requesting a discussions app', () => {
          const USE_DISCUSSIONS = true

          createDAO(USE_DISCUSSIONS, PERIODS)
          //itCostsUpTo(5.05e6)
          itSetupsDAOCorrectly(...PERIODS)
          itSetupsDiscussionsAppCorrectly()
        })

        context('when requesting a vault app', () => {
          const USE_DISCUSSIONS = false

          createDAO(USE_DISCUSSIONS, PERIODS)
          // itCostsUpTo(6.79e6)
          itSetupsDAOCorrectly(...PERIODS)
          itSetupsVaultAppCorrectly()
        })
      })
    })
  })
})
