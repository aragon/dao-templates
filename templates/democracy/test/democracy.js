const { hash: namehash } = require('eth-ens-namehash')
const { APP_IDS } = require('@aragon/templates-shared/helpers/apps')
const { isGanache } = require('@aragon/templates-shared/helpers/node')(web3)
const { isLocalNetwork } = require('@aragon/templates-shared/lib/network')(web3)
const { encodeCallScript } = require('@aragon/test-helpers/evmScript')
const { deployedAddresses } = require('@aragon/templates-shared/lib/arapp-file')(web3)

const timeTravel = require('@aragon/test-helpers/timeTravel')(web3)
const getBalance = require('@aragon/test-helpers/balance')(web3)
const getBlockNumber = require('@aragon/test-helpers/blockNumber')(web3)
const assertRole = require('@aragon/templates-shared/helpers/assertRole')(web3)
const assertRevert = require('@aragon/templates-shared/helpers/assertRevert')(web3)
const decodeEvents = require('@aragon/templates-shared/helpers/decodeEvents')

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
const Timestamp = artifacts.require('Timestamp')

const pct16 = x => new web3.BigNumber(x).times(new web3.BigNumber(10).toPower(16))
const getVoteId = receipt => decodeEvents(receipt, Voting.abi, 'StartVote')[0].args.voteId
const getAppProxy = (receipt, id) => decodeEvents(receipt, DemocracyTemplate.abi, 'InstalledApp').find(e => e.args.appId === id).args.appProxy

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'
const ETH = ZERO_ADDRESS

contract('Democracy', ([owner, holder20, holder29, holder51, nonHolder]) => {
  let ens, token, dao, finance, tokenManager, vault, voting, template, receiptInstance, receiptToken

  const TOKEN_NAME = 'DemocracyToken'
  const TOKEN_SYMBOL = 'DTT'
  const VOTING_TIME = 60
  const REQUIRED_SUPPORT = pct16(50)
  const ACCEPTANCE_QUORUM = pct16(20)
  const STAKES = [20e18, 29e18, 51e18]
  const HOLDERS = [holder20, holder29, holder51]

  const increaseTime = async s => {
    if (isGanache()) return timeTravel(s)
    const previousTime = await (await Timestamp.new()).getNow()
    await new Promise(resolve => setTimeout(resolve, s * 1000))
    const currentTime = await (await Timestamp.new()).getNow()
    assert.isAtLeast(currentTime.minus(s).toNumber(), previousTime.toNumber(), `sleep/time-travel helper failed to increase ${s} seconds`)
  }

  before('fetch democracy template', async () => {
    // Transfer some ETH to other accounts if we are working in devnet or rpc
    if (await isLocalNetwork()) {
      await web3.eth.sendTransaction({ from: owner, to: holder20, value: web3.toWei(10, 'ether') })
      await web3.eth.sendTransaction({ from: owner, to: holder29, value: web3.toWei(10, 'ether') })
      await web3.eth.sendTransaction({ from: owner, to: holder51, value: web3.toWei(10, 'ether') })
      await web3.eth.sendTransaction({ from: owner, to: nonHolder, value: web3.toWei(10, 'ether') })
    }

    const { registry, address } = await deployedAddresses()
    ens = ENS.at(registry)
    template = DemocracyTemplate.at(address)
  })

  // Test when organization is created in one call with `newTokenAndInstance()` and in
  // two calls with `newToken()` and `newInstance()`
  for (const creationStyle of ['single', 'separate']) {
    context(`> Creation through ${creationStyle} transaction`, () => {
      let aragonId

      before('create democracy entity', async () => {
        aragonId = 'democracydao-' + Math.floor(Math.random() * 1000)

        if (creationStyle === 'single') {
          receiptInstance = (await template.newTokenAndInstance(TOKEN_NAME, TOKEN_SYMBOL, aragonId, HOLDERS, STAKES, REQUIRED_SUPPORT, ACCEPTANCE_QUORUM, VOTING_TIME)).receipt
          receiptToken = receiptInstance
        } else if (creationStyle === 'separate') {
          receiptToken = (await template.newToken(TOKEN_NAME, TOKEN_SYMBOL)).receipt
          receiptInstance = (await template.newInstance(aragonId, HOLDERS, STAKES, REQUIRED_SUPPORT, ACCEPTANCE_QUORUM, VOTING_TIME)).receipt
        }

        dao = Kernel.at(decodeEvents(receiptInstance, DemocracyTemplate.abi, 'DeployDao')[0].args.dao)
        token = MiniMeToken.at(decodeEvents(receiptToken, DemocracyTemplate.abi, 'DeployToken')[0].args.token)
      })

      before('load apps', async () => {
        vault = Vault.at(getAppProxy(receiptInstance, APP_IDS.vault))
        voting = Voting.at(getAppProxy(receiptInstance, APP_IDS.voting))
        finance = Finance.at(getAppProxy(receiptInstance, APP_IDS.finance))
        tokenManager = TokenManager.at(getAppProxy(receiptInstance, APP_IDS['token-manager']))
      })

      it('creates and initializes a DAO with its Token', async() => {
        assert.notEqual(dao.address, ZERO_ADDRESS, 'Instance not generated')
        assert.notEqual(token.address, ZERO_ADDRESS, 'Token not generated')

        // Check ENS assignment
        const aragonIdNamehash = namehash(`${aragonId}.aragonid.eth`)
        const resolvedAddr = await PublicResolver.at(await ens.resolver(aragonIdNamehash)).addr(aragonIdNamehash)
        assert.equal(web3.toChecksumAddress(resolvedAddr), dao.address, 'aragonId ENS name does not match')

        // Check token values
        assert.equal(await token.name(), TOKEN_NAME, 'token name does not match')
        assert.equal(await token.symbol(), TOKEN_SYMBOL, 'token symbol does not match')
      })

      it('has initialized all apps', async () => {
        assert.isTrue(await finance.hasInitialized(), 'finance not initialized')
        assert.isTrue(await tokenManager.hasInitialized(), 'tokenManager not initialized')
        assert.isTrue(await vault.hasInitialized(), 'vault not initialized')
        assert.isTrue(await voting.hasInitialized(), 'voting not initialized')
      })

      it('has correct permissions', async () =>{
        const acl = ACL.at(await dao.acl())

        // app manager role
        await assertRole(acl, dao, voting, 'APP_MANAGER_ROLE')
        // create permissions role
        await assertRole(acl, acl, voting, 'CREATE_PERMISSIONS_ROLE')

        // evm script registry
        const reg = await EVMScriptRegistry.at(await acl.getEVMScriptRegistry())
        await assertRole(acl, reg, voting, 'REGISTRY_MANAGER_ROLE')
        await assertRole(acl, reg, voting, 'REGISTRY_ADD_EXECUTOR_ROLE')

        // voting
        await assertRole(acl, voting, voting, 'CREATE_VOTES_ROLE', tokenManager)
        await assertRole(acl, voting, voting, 'MODIFY_QUORUM_ROLE')
        assert.equal(await acl.getPermissionManager(voting.address, await voting.MODIFY_SUPPORT_ROLE()), await acl.BURN_ENTITY(), 'Voting MODIFY_SUPPORT Manager should be burned')

        // vault
        await assertRole(acl, vault, voting, 'TRANSFER_ROLE', finance)

        // finance
        await assertRole(acl, finance, voting, 'CREATE_PAYMENTS_ROLE')
        await assertRole(acl, finance, voting, 'EXECUTE_PAYMENTS_ROLE')
        await assertRole(acl, finance, voting, 'MANAGE_PAYMENTS_ROLE')

        // token manager
        await assertRole(acl, tokenManager, voting, 'ASSIGN_ROLE')
        await assertRole(acl, tokenManager, voting, 'REVOKE_VESTINGS_ROLE')
      })

      it('fails creating a DAO if holders and stakes do not match', async() => {
        const aragonId = 'bad-democracy-dao'
        const tokenName = 'BadDemocracyToken'
        const tokenSymbol = 'BDT'
        const badStakes = [20e18, 29e18]

        if (creationStyle === 'single') {
          await assertRevert(template.newTokenAndInstance.request(tokenName, tokenSymbol, aragonId, HOLDERS, badStakes, REQUIRED_SUPPORT, ACCEPTANCE_QUORUM, VOTING_TIME), 'DEMOCRACY_INVALID_HOLDERS_STAKES_LEN')
        } else if (creationStyle === 'separate') {
          await template.newToken(tokenName, tokenSymbol)
          await assertRevert(template.newInstance.request(aragonId, HOLDERS, badStakes, REQUIRED_SUPPORT, ACCEPTANCE_QUORUM, VOTING_TIME), 'DEMOCRACY_INVALID_HOLDERS_STAKES_LEN')
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
              const { receipt } = await tokenManager.forward(newVoteScript, { from: holder20 })
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

        context('> Finance access', () => {
          let voteId
          const payment = new web3.BigNumber(2e16)

          beforeEach('fund finance', async () => {
            await finance.sendTransaction({ value: payment, from: owner })
            const paymentAction = { to: finance.address, calldata: finance.contract.newImmediatePayment.getData(ETH, nonHolder, payment, 'voting payment') }
            const paymentScript = encodeCallScript([paymentAction])
            
            const newVoteAction = { to: voting.address, calldata: voting.contract.newVote.getData(paymentScript, 'metadata') }
            const newVoteScript = encodeCallScript([newVoteAction])
            
            const { receipt } = await tokenManager.forward(newVoteScript, { from: holder20 })
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
