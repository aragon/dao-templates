const { hash: namehash } = require('eth-ens-namehash')
const { isGeth } = require('@aragon/templates-shared/helpers/node')(web3)
const { randomId } = require('@aragon/templates-shared/helpers/aragonId')
const { isLocalNetwork } = require('@aragon/templates-shared/lib/network')(web3)
const { encodeCallScript } = require('@aragon/test-helpers/evmScript')
const { getEventArgument } = require('@aragon/test-helpers/events')
const { deployedAddresses } = require('@aragon/templates-shared/lib/arapp-file')(web3)
const { decodeEvents, getInstalledAppsById } = require('@aragon/templates-shared/helpers/events')(artifacts)
const { assertRole, assertBurnedRole, assertMissingRole } = require('@aragon/templates-shared/helpers/assertRole')(web3)

const getBalance = require('@aragon/test-helpers/balance')(web3)
const getBlockNumber = require('@aragon/test-helpers/blockNumber')(web3)
const assertRevert = require('@aragon/templates-shared/helpers/assertRevert')(web3)
const increaseTime = require('@aragon/templates-shared/helpers/increaseTime')(web3, artifacts)

const DemocracyTemplate = artifacts.require('DemocracyTemplate')

const ENS = artifacts.require('ENS')
const ACL = artifacts.require('ACL')
const Kernel = artifacts.require('Kernel')
const Vault = artifacts.require('Vault')
const Voting = artifacts.require('Voting')
const Finance = artifacts.require('Finance')
const TokenManager = artifacts.require('TokenManager')
const MiniMeToken = artifacts.require('MiniMeToken')
const PublicResolver = artifacts.require('PublicResolver')
const ExecutionTarget = artifacts.require('ExecutionTarget')
const EVMScriptRegistry = artifacts.require('EVMScriptRegistry')

const pct16 = x => new web3.BigNumber(x).times(new web3.BigNumber(10).toPower(16))
const getVoteId = receipt => decodeEvents(receipt, Voting.abi, 'StartVote')[0].args.voteId

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'
const ETH = ZERO_ADDRESS

contract('Democracy', ([owner, holder20, holder29, holder51, nonHolder]) => {
  let daoID, template, dao, acl, ens, instanceReceipt, tokenReceipt
  let voting, tokenManager, token, finance, vault

  const TOKEN_NAME = 'DemocracyToken'
  const TOKEN_SYMBOL = 'DTT'
  const VOTING_TIME = 60
  const REQUIRED_SUPPORT = pct16(50)
  const ACCEPTANCE_QUORUM = pct16(20)
  const STAKES = [20e18, 29e18, 51e18]
  const HOLDERS = [holder20, holder29, holder51]

  before('fetch democracy template and ENS', async () => {
    const { registry, address } = await deployedAddresses()
    ens = ENS.at(registry)
    template = DemocracyTemplate.at(address)
  })

  for (const creationStyle of ['single', 'separate']) {
    // Test when organization is created in one call with `newTokenAndInstance()` and in
    // two calls with `newToken()` and `newInstance()`

    context(`> Creation through ${creationStyle} transaction`, () => {
      before('build dao ID', () => {
        daoID = randomId()
      })

      context('when the creation fails', () => {
        if (creationStyle === 'single') {
          it('reverts when creating a DAO if holders and stakes do not match', async() => {
            const BAD_STAKES = [20e18, 29e18]

            await assertRevert(template.newTokenAndInstance.request(TOKEN_NAME, TOKEN_SYMBOL, daoID, HOLDERS, BAD_STAKES, REQUIRED_SUPPORT, ACCEPTANCE_QUORUM, VOTING_TIME), 'DEMOCRACY_BAD_HOLDERS_STAKES_LEN')
          })
        } else if (creationStyle === 'separate') {
          it('reverts when creating a DAO if tokens were not created before', async() => {
            await assertRevert(template.newInstance.request(daoID, HOLDERS, STAKES, REQUIRED_SUPPORT, ACCEPTANCE_QUORUM, VOTING_TIME), 'DEMOCRACY_MISSING_TOKEN_CACHE')
          })

          it('reverts when creating a DAO if holders and stakes do not match', async() => {
            const BAD_STAKES = [20e18, 29e18]

            await template.newToken(TOKEN_NAME, TOKEN_SYMBOL)
            await assertRevert(template.newInstance.request(daoID, HOLDERS, BAD_STAKES, REQUIRED_SUPPORT, ACCEPTANCE_QUORUM, VOTING_TIME), 'DEMOCRACY_BAD_HOLDERS_STAKES_LEN')
          })
        }
      })

      context('when the creation succeeds', () => {
        before('create democracy entity', async () => {
          if (creationStyle === 'single') {
            instanceReceipt = await template.newTokenAndInstance(TOKEN_NAME, TOKEN_SYMBOL, daoID, HOLDERS, STAKES, REQUIRED_SUPPORT, ACCEPTANCE_QUORUM, VOTING_TIME, { from: owner })
            tokenReceipt = instanceReceipt
          } else if (creationStyle === 'separate') {
            tokenReceipt = await template.newToken(TOKEN_NAME, TOKEN_SYMBOL, { from: owner })
            instanceReceipt = await template.newInstance(daoID, HOLDERS, STAKES, REQUIRED_SUPPORT, ACCEPTANCE_QUORUM, VOTING_TIME, { from: owner })
          }

          dao = Kernel.at(getEventArgument(instanceReceipt, 'DeployDao', 'dao'))
          token = MiniMeToken.at(getEventArgument(tokenReceipt, 'DeployToken', 'token'))
        })

        before('load apps', async () => {
          const installedApps = getInstalledAppsById(instanceReceipt)
          assert.equal(installedApps.vault.length, 1, 'should have installed 1 vault app')
          assert.equal(installedApps.voting.length, 1, 'should have installed 1 voting app')
          assert.equal(installedApps.finance.length, 1, 'should have installed 1 finance app')
          assert.equal(installedApps['token-manager'].length, 1, 'should have installed 1 token manager app')

          acl = ACL.at(await dao.acl())
          vault = Vault.at(installedApps.vault[0])
          voting = Voting.at(installedApps.voting[0])
          finance = Finance.at(installedApps.finance[0])
          tokenManager = TokenManager.at(installedApps['token-manager'][0])
        })

        it('costs ~6.6e6 gas', async () => {
          if (creationStyle === 'single') {
            assert.isAtMost(instanceReceipt.receipt.gasUsed, 6.7e6, 'create script should cost almost 6.7e6 gas')
          } else if (creationStyle === 'separate') {
            assert.isAtMost(tokenReceipt.receipt.gasUsed, 1.8e6, 'create token script should cost almost 6.8e6 gas')
            assert.isAtMost(instanceReceipt.receipt.gasUsed, 5e6, 'create instance should cost almost 5e6 gas')
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

        it('mints requested amounts for holders', async () => {
          assert.equal((await token.totalSupply()).toString(), STAKES.reduce((a, b) => a + b))
          for (const holder of HOLDERS) assert.equal((await token.balanceOf(holder)).toString(), STAKES[HOLDERS.indexOf(holder)])
        })

        it('should have voting app correctly setup', async () => {
          assert.isTrue(await voting.hasInitialized(), 'voting not initialized')
          assert.equal((await voting.supportRequiredPct()).toString(), REQUIRED_SUPPORT)
          assert.equal((await voting.minAcceptQuorumPct()).toString(), ACCEPTANCE_QUORUM)
          assert.equal((await voting.voteTime()).toString(), VOTING_TIME)

          await assertRole(acl, voting, voting, 'CREATE_VOTES_ROLE', tokenManager)
          await assertRole(acl, voting, voting, 'MODIFY_QUORUM_ROLE')
          await assertBurnedRole(acl, voting, 'MODIFY_SUPPORT_ROLE')
        })

        it('should have token manager app correctly setup', async () => {
          assert.isTrue(await tokenManager.hasInitialized(), 'token manager not initialized')
          assert.equal(await tokenManager.token(), token.address)

          await assertRole(acl, tokenManager, voting, 'ASSIGN_ROLE')
          await assertRole(acl, tokenManager, voting, 'REVOKE_VESTINGS_ROLE')
          await assertRole(acl, tokenManager, voting, 'MINT_ROLE')

          await assertMissingRole(acl, tokenManager, 'ISSUE_ROLE')
          await assertMissingRole(acl, tokenManager, 'BURN_ROLE')
        })

        it('should have finance app correctly setup', async () => {
          assert.isTrue(await finance.hasInitialized(), 'finance not initialized')
          assert.equal((await finance.getPeriodDuration()).toString(), 60 * 60 * 24 * 30, 'finance period should be 30 days')
          assert.equal(web3.toChecksumAddress(await finance.vault()), vault.address)

          await assertRole(acl, finance, voting, 'CREATE_PAYMENTS_ROLE')
          await assertRole(acl, finance, voting, 'EXECUTE_PAYMENTS_ROLE')
          await assertRole(acl, finance, voting, 'MANAGE_PAYMENTS_ROLE')

          await assertMissingRole(acl, finance, 'CHANGE_PERIOD_ROLE')
          await assertMissingRole(acl, finance, 'CHANGE_BUDGETS_ROLE')
        })

        it('should have vault app correctly setup', async () => {
          assert.isTrue(await vault.hasInitialized(), 'vault not initialized')
          await assertRole(acl, vault, voting, 'TRANSFER_ROLE', finance)
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

      context('integration', () => {
        before('fund holder accounts ETH', async () => {
          if (await isLocalNetwork() && isGeth()) {
            await web3.eth.sendTransaction({ from: owner, to: holder20, value: web3.toWei(10, 'ether') })
            await web3.eth.sendTransaction({ from: owner, to: holder29, value: web3.toWei(10, 'ether') })
            await web3.eth.sendTransaction({ from: owner, to: holder51, value: web3.toWei(10, 'ether') })
            await web3.eth.sendTransaction({ from: owner, to: nonHolder, value: web3.toWei(10, 'ether') })
          }
        })

        context('> Vote access', () => {
          it('set up voting correctly', async () => {
            assert.equal((await voting.voteTime()).toString(), VOTING_TIME.toString(), 'voting time not correct')
            assert.equal((await voting.supportRequiredPct()).toString(), REQUIRED_SUPPORT.toString(), 'support required not correct')
            assert.equal((await voting.minAcceptQuorumPct()).toString(), ACCEPTANCE_QUORUM.toString(), 'accept quorum not correct')
          })

          it('cannot reinitialize voting', async () => {
            await assertRevert(voting.initialize.request(token.address, REQUIRED_SUPPORT, ACCEPTANCE_QUORUM, VOTING_TIME), 'INIT_ALREADY_INITIALIZED')
          })

          it('fails trying to modify support threshold', async () => {
            await assertRevert(voting.changeSupportRequiredPct.request(REQUIRED_SUPPORT.add(1)), 'APP_AUTH_FAILED')
          })

          context('> Creating vote', () => {
            let executionTarget, mockScript

            beforeEach('create vote script', async () => {
              executionTarget = await ExecutionTarget.new()
              const mockAction = { to: executionTarget.address, calldata: executionTarget.contract.execute.getData() }
              mockScript = encodeCallScript([mockAction])
            })

            context('when the creation fails', () => {
              it('throws when non-holder tries to create a vote directly', async () => {
                await assertRevert(voting.newVote.request(mockScript, 'metadata', { from: nonHolder }), 'APP_AUTH_FAILED')
              })

              it('throws when non-holder tries to create a vote through token manager', async () => {
                const newVoteAction = { to: voting.address, calldata: voting.contract.newVote.getData(mockScript, 'metadata') }
                const newVoteScript = encodeCallScript([newVoteAction])

                await assertRevert(tokenManager.forward.request(newVoteScript, { from: nonHolder }), 'TM_CAN_NOT_FORWARD')
              })
            })

            context('when the creation succeeds', () => {
              let voteId

              beforeEach('create vote', async () => {
                const newVoteAction = { to: voting.address, calldata: voting.contract.newVote.getData(mockScript, 'metadata') }
                const newVoteScript = encodeCallScript([newVoteAction])
                const receipt = await tokenManager.forward(newVoteScript, { from: holder20 })
                voteId = getVoteId(receipt)
              })

              it('has correct state', async() => {
                const [isOpen, isExecuted, startDate, snapshotBlock, requiredSupport, minQuorum, y, n, totalVoters, execScript] = await voting.getVote(voteId)

                assert.isTrue(isOpen, 'vote should be open')
                assert.isFalse(isExecuted, 'vote should be executed')
                assert.equal(snapshotBlock.toString(), await getBlockNumber() - 1, 'snapshot block should be correct')
                assert.equal(requiredSupport.toString(), REQUIRED_SUPPORT.toString(), 'min quorum should be app min quorum')
                assert.equal(minQuorum.toString(), ACCEPTANCE_QUORUM.toString(), 'min quorum should be app min quorum')
                assert.equal(y, 0, 'initial yea should be 0')
                assert.equal(n, 0, 'initial nay should be 0')
                assert.equal(totalVoters.toString(), new web3.BigNumber(100e18).toString(), 'total voters should be 100')
                assert.equal(execScript, mockScript, 'script should be correct')
              })

              it('holder can vote', async () => {
                await voting.vote(voteId, false, true, { from: holder29 })
                const state = await voting.getVote(voteId)

                assert.equal(state[7].toString(), new web3.BigNumber(29e18).toString(), 'nay vote should have been counted')
              })

              it('holder can modify vote', async () => {
                await voting.vote(voteId, true, true, { from: holder29 })
                await voting.vote(voteId, false, true, { from: holder29 })
                await voting.vote(voteId, true, true, { from: holder29 })
                const state = await voting.getVote(voteId)

                assert.equal(state[6].toString(), new web3.BigNumber(29e18).toString(), 'yea vote should have been counted')
                assert.equal(state[7], 0, 'nay vote should have been removed')
              })

              it('throws when non-holder votes', async () => {
                await assertRevert(voting.vote.request(voteId, true, true, { from: nonHolder }), 'VOTING_CAN_NOT_VOTE')
              })

              it('throws when voting after voting closes', async () => {
                await increaseTime(VOTING_TIME + 1)

                await assertRevert(voting.vote.request(voteId, true, true, { from: holder29 }), 'VOTING_CAN_NOT_VOTE')
              })

              it('can execute if vote is approved with support and quorum', async () => {
                await voting.vote(voteId, true, true, { from: holder29 })
                await voting.vote(voteId, false, true, { from: holder20 })

                await increaseTime(VOTING_TIME + 1)

                await voting.executeVote(voteId, { from: owner })
                assert.equal((await executionTarget.counter()).toString(), 1, 'should have executed result')
              })

              it('cannot execute vote if not enough quorum met', async () => {
                await voting.vote(voteId, true, true, { from: holder20 })

                await increaseTime(VOTING_TIME + 1)

                await assertRevert(voting.executeVote.request(voteId, { from: owner }), 'VOTING_CAN_NOT_EXECUTE')
              })

              it('cannot execute vote if not support met', async () => {
                await voting.vote(voteId, false, true, { from: holder29 })
                await voting.vote(voteId, false, true, { from: holder20 })

                await increaseTime(VOTING_TIME + 1)

                await assertRevert(voting.executeVote.request(voteId, { from: owner }), 'VOTING_CAN_NOT_EXECUTE')
              })
            })
          })
        })

        context('> Finance access', () => {
          let voteId
          const payment = new web3.BigNumber(2e16)

          beforeEach('make a payment', async () => {
            await finance.sendTransaction({ value: payment, from: owner })
            const paymentAction = { to: finance.address, calldata: finance.contract.newImmediatePayment.getData(ETH, nonHolder, payment, 'voting payment') }
            const paymentScript = encodeCallScript([paymentAction])

            const newVoteAction = { to: voting.address, calldata: voting.contract.newVote.getData(paymentScript, 'metadata') }
            const newVoteScript = encodeCallScript([newVoteAction])

            const receipt = await tokenManager.forward(newVoteScript, { from: holder20 })
            voteId = getVoteId(receipt)
          })

          it('finance can not be accessed directly (without a vote)', async () => {
            await assertRevert(finance.newImmediatePayment.request(ETH, nonHolder, 2e16, 'voting payment'), 'APP_AUTH_FAILED')
          })

          it('transfers funds if vote is approved', async () => {
            const receiverInitialBalance = await getBalance(nonHolder)

            await voting.vote(voteId, true, true, { from: holder29 })
            await voting.vote(voteId, false, true, { from: holder20 })

            await increaseTime(VOTING_TIME + 1)
            await voting.executeVote(voteId, {from: owner})

            assert.equal((await getBalance(nonHolder)).toString(), receiverInitialBalance.plus(payment).toString(), 'Receiver did not get the payment')
          })
        })
      })
    })
  }
})
