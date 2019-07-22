const { hash: namehash } = require('eth-ens-namehash')
const { APP_IDS } = require('@aragon/templates-shared/helpers/apps')
const { randomId } = require('@aragon/templates-shared/helpers/aragonId')
const { getEventArgument } = require('@aragon/test-helpers/events')
const { deployedAddresses } = require('@aragon/templates-shared/lib/arapp-file')(web3)
const { assertRole, assertMissingRole } = require('@aragon/templates-shared/helpers/assertRole')(web3)
const decodeEvents = require('@aragon/templates-shared/helpers/decodeEvents')
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

contract('Company with board', ([_, deployer, boardMember1, boardMember2, shareHolder1, shareHolder2, shareHolder3]) => {
  let daoID, template, dao, acl, setupReceipt, prepareReceipt, tokenReceipt
  let shareVoting, boardVoting, boardTokenManager, shareTokenManager, boardToken, shareToken, finance, agent

  const BOARD_MEMBERS = [boardMember1, boardMember2]
  const SHARE_HOLDERS = [shareHolder1, shareHolder2, shareHolder3]
  const SHARE_STAKES = SHARE_HOLDERS.map(() => 1e18)

  before('fetch company board template', async () => {
    template = CompanyTemplate.at((await deployedAddresses()).address)
  })

  describe('newTokens', async () => {
    before('create tokens', async () => {
      tokenReceipt = await template.newTokens()
      boardToken = MiniMeToken.at(getEventArgument(tokenReceipt, 'DeployToken', 'token', 0))
      shareToken = MiniMeToken.at(getEventArgument(tokenReceipt, 'DeployToken', 'token', 1))
    })

    it('costs less than 3.5e6 gas', async () => {
      assert.isAtMost(tokenReceipt.receipt.gasUsed, 3.5e6, 'tokens creation should cost almost 3.5e6 gas')
    })

    it('creates a new share token', async () => {
      assert.equal(await shareToken.name(), 'Share Token')
      assert.equal(await shareToken.symbol(), 'SHARE')
      assert.equal((await shareToken.decimals()).toString(), 18)
    })

    it('creates a new board token', async () => {
      assert.equal(await boardToken.name(), 'Board Token')
      assert.equal(await boardToken.symbol(), 'BOARD')
      assert.equal((await boardToken.decimals()).toString(), 18)
    })
  })

  describe('prepareInstance', async () => {
    before('prepare DAO', async () => {
      daoID = randomId()
      prepareReceipt = await template.prepareInstance(daoID)
      dao = Kernel.at(getEventArgument(prepareReceipt, 'DeployDao', 'dao'))
      acl = ACL.at(await dao.acl())
    })

    it('costs less than 1.7e6 gas', async () => {
      assert.isAtMost(prepareReceipt.receipt.gasUsed, 1.7e6, 'prepare DAO should cost almost 1.7e6 gas')
    })

    it('registers a new DAO on ENS', async () => {
      const ens = ENS.at((await deployedAddresses()).registry)
      const aragonIdNameHash = namehash(`${daoID}.aragonid.eth`)
      const resolvedAddress = await PublicResolver.at(await ens.resolver(aragonIdNameHash)).addr(aragonIdNameHash)
      assert.equal(resolvedAddress, dao.address, 'aragonId ENS name does not match')
    })

    it('creates a new DAO with root permissions for the template', async () => {
      await assertRole(acl, dao, template, 'APP_MANAGER_ROLE')
      await assertRole(acl, acl, template, 'CREATE_PERMISSIONS_ROLE')
    })
  })

  describe('setupInstance', async () => {
    context('when there was no token created before', () => {
      it('reverts', async () => {
        await assertRevert(template.setupInstance.request(BOARD_MEMBERS, SHARE_HOLDERS, SHARE_STAKES, { from: deployer }), 'COMPANY_MISSING_DAO_CACHE')
      })
    })

    context('when there was a token created', () => {
      before('create token', async () => {
        const tokenReceipt = await template.newTokens({ from: deployer })
        boardToken = MiniMeToken.at(getEventArgument(tokenReceipt, 'DeployToken', 'token', 0))
        shareToken = MiniMeToken.at(getEventArgument(tokenReceipt, 'DeployToken', 'token', 1))
      })

      context('when there was no DAO prepared before', () => {
        it('reverts', async () => {
          await assertRevert(template.setupInstance.request(BOARD_MEMBERS, SHARE_HOLDERS, SHARE_STAKES, { from: deployer }), 'COMPANY_MISSING_DAO_CACHE')
        })
      })

      context('when there was a DAO prepared', () => {
        before('prepare DAO', async () => {
          daoID = randomId()
          prepareReceipt = await template.prepareInstance(daoID, { from: deployer })
          dao = Kernel.at(getEventArgument(prepareReceipt, 'DeployDao', 'dao'))
          acl = ACL.at(await dao.acl())
        })

        context('when no board members were given', () => {
          it('reverts', async () => {
            await assertRevert(template.setupInstance.request([], SHARE_HOLDERS, SHARE_STAKES), 'COMPANY_MISSING_BOARD_MEMBERS')
          })
        })

        context('when the given share holders and stakes length do not match', () => {
          it('reverts', async () => {
            await assertRevert(template.setupInstance.request(BOARD_MEMBERS, [], SHARE_STAKES, { from: deployer }), 'COMPANY_BAD_HOLDERS_STAKES_LEN')
            await assertRevert(template.setupInstance.request(BOARD_MEMBERS, SHARE_HOLDERS, [], { from: deployer }), 'COMPANY_BAD_HOLDERS_STAKES_LEN')
          })
        })

        context('when the given share holders and board members are correct', () => {
          before('create company with board entity', async () => {
            setupReceipt = await template.setupInstance(BOARD_MEMBERS, SHARE_HOLDERS, SHARE_STAKES, { from: deployer })
          })

          before('load apps', async () => {
            const events = decodeEvents(setupReceipt.receipt, Kernel.abi, 'NewAppProxy')
            const agentEvents = events.filter(e => e.args.appId === APP_IDS.agent)
            const votingEvents = events.filter(e => e.args.appId === APP_IDS.voting)
            const financeEvents = events.filter(e => e.args.appId === APP_IDS.finance)
            const tokenManagerEvents = events.filter(e => e.args.appId === APP_IDS['token-manager'])

            assert.equal(agentEvents.length, 1, 'should have deployed 1 agent app')
            assert.equal(votingEvents.length, 2, 'should have deployed 2 voting apps')
            assert.equal(financeEvents.length, 1, 'should have deployed 1 finance app')
            assert.equal(tokenManagerEvents.length, 2, 'should have deployed 2 token manager apps')

            agent = Agent.at(agentEvents[0].args.proxy)
            finance = Finance.at(financeEvents[0].args.proxy)
            boardVoting = Voting.at(votingEvents[0].args.proxy)
            shareVoting = Voting.at(votingEvents[1].args.proxy)
            boardTokenManager = TokenManager.at(tokenManagerEvents[0].args.proxy)
            shareTokenManager = TokenManager.at(tokenManagerEvents[1].args.proxy)
          })

          it('costs less than 5.3e6 gas', async () => {
            assert.isAtMost(setupReceipt.receipt.gasUsed, 5.3e6, 'setup DAO should cost almost 5.3e6 gas')
          })

          it('mints requested amounts for the board members', async () => {
            assert.equal((await boardToken.totalSupply()).toString(), BOARD_MEMBERS.length)
            for (const holder of BOARD_MEMBERS) assert.equal((await boardToken.balanceOf(holder)).toString(), 1)
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
    })
  })
})
