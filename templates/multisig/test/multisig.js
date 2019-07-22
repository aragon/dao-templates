const { hash: namehash } = require('eth-ens-namehash')
const { APP_IDS } = require('@aragon/templates-shared/helpers/apps')
const { randomId } = require('@aragon/templates-shared/helpers/aragonId')
const { isLocalNetwork } = require('@aragon/templates-shared/lib/network')(web3)
const { encodeCallScript } = require('@aragon/test-helpers/evmScript')
const { deployedAddresses } = require('@aragon/templates-shared/lib/arapp-file')(web3)
const { assertRole, assertMissingRole } = require('@aragon/templates-shared/helpers/assertRole')(web3)

const getBalance = require('@aragon/test-helpers/balance')(web3)
const getBlockNumber = require('@aragon/test-helpers/blockNumber')(web3)
const assertRevert = require('@aragon/templates-shared/helpers/assertRevert')(web3)
const decodeEvents = require('@aragon/templates-shared/helpers/decodeEvents')

const MultisigTemplate = artifacts.require('MultisigTemplate')

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

const getVoteId = receipt => decodeEvents(receipt, Voting.abi, 'StartVote')[0].args.voteId
const getAppProxy = (receipt, id) => decodeEvents(receipt, MultisigTemplate.abi, 'InstalledApp').find(e => e.args.appId === id).args.appProxy

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'
const ETH = ZERO_ADDRESS

contract('Multisig', ([owner, signer1, signer2, signer3, nonHolder]) => {
  let ens, token, dao, finance, tokenManager, vault, voting, template, receiptInstance, receiptToken

  const TOKEN_NAME = 'MultisigToken'
  const TOKEN_SYMBOL = 'MTT'
  const NEEDED_SIGNATURES = 2
  const SIGNERS = [signer1, signer2, signer3]
  const VOTING_TIME = 1825 * 24 * 60 * 60 // 1825 days; ~5 years
  const REQUIRED_SUPPORT = new web3.BigNumber(10 ** 18).times(NEEDED_SIGNATURES).dividedToIntegerBy(SIGNERS.length).minus(1)

  before('fetch multisig template', async () => {
    // Transfer some ETH to other accounts if we are working in devnet or rpc
    if (await isLocalNetwork()) {
      await web3.eth.sendTransaction({ from: owner, to: signer1, value: web3.toWei(10, 'ether') })
      await web3.eth.sendTransaction({ from: owner, to: signer2, value: web3.toWei(10, 'ether') })
      await web3.eth.sendTransaction({ from: owner, to: signer3, value: web3.toWei(10, 'ether') })
      await web3.eth.sendTransaction({ from: owner, to: nonHolder, value: web3.toWei(10, 'ether') })
    }

    const { registry, address } = await deployedAddresses()
    ens = ENS.at(registry)
    template = MultisigTemplate.at(address)
  })

  // Test when organization is created in one call with `newTokenAndInstance()` and in
  // two calls with `newToken()` and `newInstance()`

  for (const creationStyle of ['single', 'separate']) {
    context(`> Creation through ${creationStyle} transaction`, () => {
      let aragonId

      before('create multisig entity', async () => {
        aragonId = randomId()

        if (creationStyle === 'single') {
          receiptInstance = (await template.newTokenAndInstance(TOKEN_NAME, TOKEN_SYMBOL, aragonId, SIGNERS, NEEDED_SIGNATURES)).receipt
          receiptToken = receiptInstance
        } else if (creationStyle === 'separate') {
          receiptToken = (await template.newToken(TOKEN_NAME, TOKEN_SYMBOL)).receipt
          receiptInstance = (await template.newInstance(aragonId, SIGNERS, NEEDED_SIGNATURES)).receipt
        }

        dao = Kernel.at(decodeEvents(receiptInstance, MultisigTemplate.abi, 'DeployDao')[0].args.dao)
        token = MiniMeToken.at(decodeEvents(receiptToken, MultisigTemplate.abi, 'DeployToken')[0].args.token)
      })

      before('load apps', async () => {
        vault = Vault.at(getAppProxy(receiptInstance, APP_IDS.vault))
        voting = Voting.at(getAppProxy(receiptInstance, APP_IDS.voting))
        finance = Finance.at(getAppProxy(receiptInstance, APP_IDS.finance))
        tokenManager = TokenManager.at(getAppProxy(receiptInstance, APP_IDS['token-manager']))
      })

      it('creates and initializes a DAO with its Token', async() => {
        assert.notEqual(token.address, ZERO_ADDRESS, 'Token not generated')
        assert.notEqual(dao.address, ZERO_ADDRESS, 'Instance not generated')

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

      it('has correct permissions', async () => {
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
        await assertRole(acl, voting, voting, 'MODIFY_SUPPORT_ROLE')

        // vault
        await assertRole(acl, vault, voting, 'TRANSFER_ROLE', finance)

        // finance
        await assertRole(acl, finance, voting, 'CREATE_PAYMENTS_ROLE')
        await assertRole(acl, finance, voting, 'EXECUTE_PAYMENTS_ROLE')
        await assertRole(acl, finance, voting, 'MANAGE_PAYMENTS_ROLE')
        await assertMissingRole(acl, finance, 'CHANGE_PERIOD_ROLE')
        await assertMissingRole(acl, finance, 'CHANGE_BUDGETS_ROLE')

        // token manager
        await assertRole(acl, tokenManager, voting, 'ASSIGN_ROLE')
        await assertRole(acl, tokenManager, voting, 'REVOKE_VESTINGS_ROLE')
        await assertRole(acl, tokenManager, voting, 'MINT_ROLE')
        await assertMissingRole(acl, tokenManager, 'ISSUE_ROLE')
        await assertMissingRole(acl, tokenManager, 'BURN_ROLE')
      })

      context('> Voting access', () => {
        it('set up voting correctly', async () => {
          assert.equal((await voting.voteTime()).toString(), VOTING_TIME, 'voting time not correct')
          assert.equal((await voting.supportRequiredPct()).toString(), REQUIRED_SUPPORT.toString(), 'support required not correct')
          assert.equal((await voting.minAcceptQuorumPct()).toString(), REQUIRED_SUPPORT.toString(), 'accept quorum not correct')
        })

        it('cannot reinitialize voting', async () => {
          await assertRevert(voting.initialize.request(token.address, 1e18, 1e18, 1000), 'INIT_ALREADY_INITIALIZED')
        })

        it('fails trying to modify support threshold directly', async () => {
          await assertRevert(voting.changeSupportRequiredPct.request(REQUIRED_SUPPORT.add(1), { from: owner }), 'APP_AUTH_FAILED')
        })

        it('changes support threshold thru voting', async () => {
          const changeSupportAction = { to: voting.address, calldata: voting.contract.changeSupportRequiredPct.getData(REQUIRED_SUPPORT.add(1)) }
          const changeSupportScript = encodeCallScript([changeSupportAction])

          const newVoteAction = { to: voting.address, calldata: voting.contract.newVote.getData(changeSupportScript, 'metadata') }
          const newVoteScript = encodeCallScript([newVoteAction])

          const { receipt } = await tokenManager.forward(newVoteScript, { from: signer1 })
          const voteId1 = getVoteId(receipt)

          await voting.vote(voteId1, true, true, { from: signer1 })
          await voting.vote(voteId1, true, true, { from: signer2 })

          const newSupport = await voting.supportRequiredPct()
          assert.equal(newSupport.toString(), REQUIRED_SUPPORT.add(1).toString(), 'Support should have changed')

          const vote = await voting.getVote(voteId1)
          assert.equal(vote[4].toString(), REQUIRED_SUPPORT.toString(), 'Support for previous vote should not have changed')

          // back to original value
          const rollbackSupportAction = { to: voting.address, calldata: voting.contract.changeSupportRequiredPct.getData(REQUIRED_SUPPORT) }
          const rollbackSupportScript = encodeCallScript([rollbackSupportAction])

          const anotherNewVoteAction = { to: voting.address, calldata: voting.contract.newVote.getData(rollbackSupportScript, 'metadata') }
          const anotherNewVoteScript = encodeCallScript([anotherNewVoteAction])

          const { receipt: anotherReceipt } = await tokenManager.forward(anotherNewVoteScript, { from: signer1 })
          const voteId2 = getVoteId(anotherReceipt)

          await voting.vote(voteId2, true, true, { from: signer1 })
          await voting.vote(voteId2, true, true, { from: signer2 })
          await voting.vote(voteId2, true, true, { from: signer3 })

          const currentSupport = await voting.supportRequiredPct()
          assert.equal(currentSupport.toString(), REQUIRED_SUPPORT.toString(), 'Support should have changed again')
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

              const { receipt } = await tokenManager.forward(newVoteScript, { from: signer1 })
              voteId = getVoteId(receipt)
            })

            it('has correct state', async() => {
              const [isOpen, isExecuted, startDate, snapshotBlock, requiredSupport, minQuorum, y, n, totalVoters, execScript] = await voting.getVote(voteId)

              assert.isTrue(isOpen, 'vote should be open')
              assert.isFalse(isExecuted, 'vote should be executed')
              assert.equal(snapshotBlock.toString(), await getBlockNumber() - 1, 'snapshot block should be correct')
              assert.equal(requiredSupport.toString(), REQUIRED_SUPPORT.toString(), 'min quorum should be app min quorum')
              assert.equal(minQuorum.toString(), REQUIRED_SUPPORT.toString(), 'min quorum should be app min quorum')
              assert.equal(y, 0, 'initial yea should be 0')
              assert.equal(n, 0, 'initial nay should be 0')
              assert.equal(totalVoters.toString(), SIGNERS.length, 'total voters should be number of signers')
              assert.equal(execScript, mockScript, 'script should be correct')
            })

            it('holder can vote', async () => {
              await voting.vote(voteId, false, true, { from: signer2 })
              const state = await voting.getVote(voteId)

              assert.equal(state[7].toString(), 1, 'nay vote should have been counted')
            })

            it('holder can modify vote', async () => {
              await voting.vote(voteId, true, true, { from: signer2 })
              await voting.vote(voteId, false, true, { from: signer2 })
              await voting.vote(voteId, true, true, { from: signer2 })
              const state = await voting.getVote(voteId)

              assert.equal(state[6].toString(), 1, 'yea vote should have been counted')
              assert.equal(state[7], 0, 'nay vote should have been removed')
            })

            it('throws when non-holder votes', async () => {
              await assertRevert(voting.vote.request(voteId, true, true, { from: nonHolder }), 'VOTING_CAN_NOT_VOTE')
            })

            it('automatically executes if vote is approved by enough signers', async () => {
              await voting.vote(voteId, true, true, { from: signer2 })
              await voting.vote(voteId, true, true, { from: signer1 })
              assert.equal((await executionTarget.counter()).toString(), 1, 'should have executed result')
            })

            it('cannot execute vote if not enough signatures', async () => {
              await voting.vote(voteId, true, true, { from: signer1 })
              assert.equal(await executionTarget.counter(), 0, 'should have not executed result')

              await assertRevert(voting.executeVote.request(voteId, {from: owner}), 'VOTING_CAN_NOT_EXECUTE')
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

            const { receipt } = await tokenManager.forward(newVoteScript, { from: signer1 })
            voteId = getVoteId(receipt)
          })

          it('finance can not be accessed directly (without a vote)', async () => {
            await assertRevert(finance.newImmediatePayment.request(ETH, nonHolder, 2e16, 'voting payment'), 'APP_AUTH_FAILED')
          })

          it('transfers funds if vote is approved', async () => {
            const receiverInitialBalance = await getBalance(nonHolder)

            await voting.vote(voteId, true, true, { from: signer2 })
            await voting.vote(voteId, true, true, { from: signer1 })

            assert.equal((await getBalance(nonHolder)).toString(), receiverInitialBalance.plus(payment).toString(), 'Receiver did not get the payment')
          })
        })
      })
    })
  }
})
