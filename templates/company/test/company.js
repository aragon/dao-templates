const { hash: namehash } = require('eth-ens-namehash')
const { APP_IDS } = require('@aragon/templates-shared/helpers/apps')
const { randomId } = require('@aragon/templates-shared/helpers/aragonId')
const { getEventArgument } = require('@aragon/test-helpers/events')
const { deployedAddresses } = require('@aragon/templates-shared/lib/arapp-file')(web3)
const { getInstalledAppsById } = require('@aragon/templates-shared/helpers/events')(artifacts)
const { assertRole, assertMissingRole } = require('@aragon/templates-shared/helpers/assertRole')(web3)
const assertRevert = require('@aragon/templates-shared/helpers/assertRevert')(web3)

const CompanyTemplate = artifacts.require('CompanyTemplate')

const ENS = artifacts.require('ENS')
const ACL = artifacts.require('ACL')
const Kernel = artifacts.require('Kernel')
const Agent = artifacts.require('Agent')
const Vault = artifacts.require('Vault')
const Voting = artifacts.require('Voting')
const Finance = artifacts.require('Finance')
const TokenManager = artifacts.require('TokenManager')
const MiniMeToken = artifacts.require('MiniMeToken')
const PublicResolver = artifacts.require('PublicResolver')
const EVMScriptRegistry = artifacts.require('EVMScriptRegistry')

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

contract('Company', ([_, owner, holder1, holder2]) => {
  let daoID, template, dao, acl, ens, instanceReceipt, tokenReceipt
  let voting, tokenManager, token, finance, agent, vault

  const HOLDERS = [holder1, holder2]
  const STAKES = HOLDERS.map(() => 1e18)
  const TOKEN_NAME = 'Share Token'
  const TOKEN_SYMBOL = 'SHARE'

  const VOTE_DURATION = 60 * 60 * 24 * 7
  const SUPPORT_REQUIRED = 50e16
  const MIN_ACCEPTANCE_QUORUM = 5e16
  const VOTING_SETTINGS = [SUPPORT_REQUIRED, MIN_ACCEPTANCE_QUORUM, VOTE_DURATION]

  const DEFAULT_FINANCE_PERIOD = 0 // When passed to template, will set 30 days as default
  const FINANCE_PERIOD = 60 * 60 * 24 * 30

  before('fetch company template and ENS', async () => {
    const { registry, address } = await deployedAddresses()
    ens = ENS.at(registry)
    template = CompanyTemplate.at(address)
  })

  for (const creationStyle of ['single', 'separate']) {
    // Test when organization is created in one call with `newTokenAndInstance()` and in
    // two calls with `newToken()` and `newInstance()`

    context(`creating entity through a ${creationStyle} transaction`, () => {

      context('when the creation fails', () => {
        before('build dao ID', () => {
          daoID = randomId()
        })

        if (creationStyle === 'single') {
          it('reverts when no holders were given', async () => {
            await assertRevert(template.newTokenAndInstance.request(daoID, [], [], TOKEN_NAME, TOKEN_SYMBOL, VOTING_SETTINGS, DEFAULT_FINANCE_PERIOD, true), 'COMPANY_EMPTY_HOLDERS')
          })

          it('reverts when holders and stakes length do not match', async () => {
            await assertRevert(template.newTokenAndInstance.request(daoID, [holder1], STAKES, TOKEN_NAME, TOKEN_SYMBOL, VOTING_SETTINGS, DEFAULT_FINANCE_PERIOD, true), 'COMPANY_BAD_HOLDERS_STAKES_LEN')
            await assertRevert(template.newTokenAndInstance.request(daoID, HOLDERS, [1e18], TOKEN_NAME, TOKEN_SYMBOL, VOTING_SETTINGS, DEFAULT_FINANCE_PERIOD, true), 'COMPANY_BAD_HOLDERS_STAKES_LEN')
          })
        } else if (creationStyle === 'separate') {
          context('when there was no token created before', () => {
            it('reverts', async () => {
              await assertRevert(template.newInstance.request(daoID, HOLDERS, STAKES, VOTING_SETTINGS, DEFAULT_FINANCE_PERIOD, true), 'COMPANY_MISSING_TOKEN_CACHE')
            })
          })

          context('when there was a token created', () => {
            before('create token', async () => {
              await template.newToken(TOKEN_NAME, TOKEN_SYMBOL)
            })

            it('reverts when no holders were given', async () => {
              await assertRevert(template.newInstance.request(daoID, [], [], VOTING_SETTINGS, DEFAULT_FINANCE_PERIOD, true), 'COMPANY_EMPTY_HOLDERS')
            })

            it('reverts when holders and stakes length do not match', async () => {
              await assertRevert(template.newInstance.request(daoID, [holder1], STAKES, VOTING_SETTINGS, DEFAULT_FINANCE_PERIOD, true), 'COMPANY_BAD_HOLDERS_STAKES_LEN')
              await assertRevert(template.newInstance.request(daoID, HOLDERS, [1e18], VOTING_SETTINGS, DEFAULT_FINANCE_PERIOD, true), 'COMPANY_BAD_HOLDERS_STAKES_LEN')
            })
          })
        }
      })

      context('when the creation succeeds', () => {

        const itHandlesInstanceCreationsProperly = (useAgentAsVault) => {
          // Test when the organization is created with an Agent app or a Vault app
          
          before('build dao ID', () => {
            daoID = randomId()
          })

          before('create company entity', async () => {
            if (creationStyle === 'single') {
              instanceReceipt = await template.newTokenAndInstance(daoID, HOLDERS, STAKES, TOKEN_NAME, TOKEN_SYMBOL, VOTING_SETTINGS, DEFAULT_FINANCE_PERIOD, useAgentAsVault, { from: owner })
              tokenReceipt = instanceReceipt
            } else if (creationStyle === 'separate') {
              tokenReceipt = await template.newToken(TOKEN_NAME, TOKEN_SYMBOL, { from: owner })
              instanceReceipt = await template.newInstance(daoID, HOLDERS, STAKES, VOTING_SETTINGS, DEFAULT_FINANCE_PERIOD, useAgentAsVault, { from: owner })
            }

            dao = Kernel.at(getEventArgument(instanceReceipt, 'DeployDao', 'dao'))
            token = MiniMeToken.at(getEventArgument(tokenReceipt, 'DeployToken', 'token'))
          })

          before('load apps', async () => {
            const installedApps = getInstalledAppsById(instanceReceipt)
            if(useAgentAsVault) assert.equal(installedApps.agent.length, 1, 'should have installed 1 agent app')
            else assert.equal(installedApps.vault.length, 1, 'should have installed 1 vault app')
            assert.equal(installedApps.voting.length, 1, 'should have installed 1 voting app')
            assert.equal(installedApps.finance.length, 1, 'should have installed 1 finance app')
            assert.equal(installedApps['token-manager'].length, 1, 'should have installed 1 token manager app')

            acl = ACL.at(await dao.acl())
            if(useAgentAsVault) agent = Agent.at(installedApps.agent[0])
            else vault = Vault.at(installedApps.vault[0]);
            voting = Voting.at(installedApps.voting[0])
            finance = Finance.at(installedApps.finance[0])
            tokenManager = TokenManager.at(installedApps['token-manager'][0])
          })

          it('costs ~6.9e6 gas', async () => {
            if (creationStyle === 'single') {
              assert.isAtMost(instanceReceipt.receipt.gasUsed, 6.8e6, 'create script should cost almost 6.8e6 gas')
            } else if (creationStyle === 'separate') {
              assert.isAtMost(tokenReceipt.receipt.gasUsed, 1.8e6, 'create token script should cost almost 1.8e6 gas')
              assert.isAtMost(instanceReceipt.receipt.gasUsed, 5.1e6, 'create instance script should cost almost 5e6 gas')
            }
          })

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

          it('mints requested amounts for the holders', async () => {
            assert.equal((await token.totalSupply()).toString(), STAKES.reduce((a, b) => a + b))
            for (const holder of HOLDERS) assert.equal((await token.balanceOf(holder)).toString(), STAKES[HOLDERS.indexOf(holder)])
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
            assert.equal((await finance.getPeriodDuration()).toString(), FINANCE_PERIOD, 'finance period should be 30 days')
            assert.equal(web3.toChecksumAddress(await finance.vault()), useAgentAsVault ? agent.address : vault.address)

            await assertRole(acl, finance, voting, 'CREATE_PAYMENTS_ROLE')
            await assertRole(acl, finance, voting, 'EXECUTE_PAYMENTS_ROLE')
            await assertRole(acl, finance, voting, 'MANAGE_PAYMENTS_ROLE')

            await assertMissingRole(acl, finance, 'CHANGE_PERIOD_ROLE')
            await assertMissingRole(acl, finance, 'CHANGE_BUDGETS_ROLE')
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
        }

        context('when using an agent as vault', () => {
          itHandlesInstanceCreationsProperly(true)

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
        })

        context('when using a regular vault', () => {
          itHandlesInstanceCreationsProperly(false)

          it('should have vault app correctly setup', async () => {
            assert.isTrue(await vault.hasInitialized(), 'vault not initialized')

            assert.equal(await dao.recoveryVaultAppId(), APP_IDS.vault, 'vault app is not being used as the vault app of the DAO')
            assert.equal(web3.toChecksumAddress(await dao.getRecoveryVault()), vault.address, 'vault app is not being used as the vault app of the DAO')

            await assertRole(acl, vault, voting, 'TRANSFER_ROLE', finance)
          })
        })

      })
    })
  }
})
