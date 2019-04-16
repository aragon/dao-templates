require('dotenv').config({ path: './node_modules/@aragon/kits-beta-base/.env'})

const getBlockNumber = require('@aragon/test-helpers/blockNumber')(web3)
const getBlock = require('@aragon/test-helpers/block')(web3)
//const timeTravel = require('@aragon/test-helpers/timeTravel')(web3)
const getBalance = require('@aragon/test-helpers/balance')(web3)
const namehash = require('eth-ens-namehash').hash
const keccak256 = require('js-sha3').keccak_256

const { encodeCallScript, EMPTY_SCRIPT } = require('@aragon/test-helpers/evmScript')

const ENS = artifacts.require('ENS')
const PublicResolver = artifacts.require('PublicResolver')

const MiniMeToken = artifacts.require('MiniMeToken')

const Finance = artifacts.require('Finance')
const TokenManager = artifacts.require('TokenManager')
const Vault = artifacts.require('Vault')
const Voting = artifacts.require('Voting')

const apps = ['finance', 'token-manager', 'vault', 'voting']
const appIds = apps.map(app => namehash(require(`@aragon/apps-${app}/arapp`).environments.default.appName))

const getContract = name => artifacts.require(name)
const pct16 = x => new web3.BigNumber(x).times(new web3.BigNumber(10).toPower(16))
const getEventResult = (receipt, event, param) => receipt.logs.filter(l => l.event == event)[0].args[param]
const getVoteId = (receipt) => {
    const logs = receipt.receipt.logs.filter(
        l =>
            l.topics[0] == web3.sha3('StartVote(uint256,address,string)')
    )
    return web3.toDecimal(logs[0].topics[1])
}
const getAppProxy = (receipt, id) => receipt.logs.filter(l => l.event == 'InstalledApp' && l.args.appId == id)[0].args.appProxy
const networks = require("@aragon/os/truffle-config").networks
const getNetwork = require('../../../helpers/networks.js')
const getKitConfiguration = async (networkName) => {
    let arappFilename
    if (networkName == 'devnet' || networkName == 'rpc') {
        arappFilename = 'arapp_local'
    } else {
        arappFilename = 'arapp'
    }
    const arappFile = require('../' + arappFilename)
    const ensAddress = arappFile.environments[networkName].registry
    const ens = getContract('ENS').at(ensAddress)
    const kitEnsName = arappFile.environments[networkName].appName
    const repoAddr = await artifacts.require('PublicResolver').at(await ens.resolver(namehash('aragonpm.eth'))).addr(namehash(kitEnsName))
    const repo = getContract('Repo').at(repoAddr)
    const kitAddress = (await repo.getLatest())[1]
    const kitContractName = arappFile.path.split('/').pop().split('.sol')[0]
    const kit = getContract(kitContractName).at(kitAddress)

    return { ens, kit }
}


contract('Multisig Kit', accounts => {
    const ETH = '0x0'
    let ens
    let daoAddress, tokenAddress
    let financeAddress, tokenManagerAddress, vaultAddress, votingAddress
    let finance, tokenManager, vault, voting
    let kit, receiptInstance
    const owner = accounts[0]
    const signer1 = accounts[1]
    const signer2 = accounts[2]
    const signer3 = accounts[3]
    const nonHolder = accounts[4]

    const signers = [signer1, signer2, signer3]
    const neededSignatures = 2
    const multisigSupport = new web3.BigNumber(10 ** 18).times(neededSignatures).dividedToIntegerBy(signers.length).minus(1)
    const multisigVotingTime = 1825 * 24 * 60 * 60 // 1825 days; ~5 years

    before(async () => {
        // create Multisig Kit
        const networkName = (await getNetwork(networks)).name
        if (networkName == 'devnet' || networkName == 'rpc') {
            // transfer some ETH to other accounts
            await web3.eth.sendTransaction({ from: owner, to: signer1, value: web3.toWei(10, 'ether') })
            await web3.eth.sendTransaction({ from: owner, to: signer2, value: web3.toWei(10, 'ether') })
            await web3.eth.sendTransaction({ from: owner, to: signer3, value: web3.toWei(10, 'ether') })
            await web3.eth.sendTransaction({ from: owner, to: nonHolder, value: web3.toWei(10, 'ether') })
        }
        const configuration = await getKitConfiguration(networkName)
        ens = configuration.ens
        kit = configuration.kit
    })

    // Test when organization is created in one call with `newTokenAndInstance()` and in
    // two calls with `newToken()` and `newInstance()`
    const creationStyles = ['single', 'separate']
    for (const creationStyle of creationStyles) {
        context(`> Creation through ${creationStyle} transaction`, () => {
            let aragonId, tokenName, tokenSymbol

            before(async () => {
                aragonId = 'multisigdao-' + Math.floor(Math.random() * 1000)
                tokenName = 'MultisigToken'
                tokenSymbol = 'MTT'

                if (creationStyle === 'single') {
                    // create token and instance
                    receiptInstance = await kit.newTokenAndInstance(tokenName, tokenSymbol, aragonId, signers, neededSignatures)
                    tokenAddress = getEventResult(receiptInstance, 'DeployToken', 'token')
                    daoAddress = getEventResult(receiptInstance, 'DeployInstance', 'dao')
                } else if (creationStyle === 'separate') {
                    // create token
                    const receiptToken = await kit.newToken(tokenName, tokenSymbol)
                    tokenAddress = getEventResult(receiptToken, 'DeployToken', 'token')

                    // create instance
                    receiptInstance = await kit.newInstance(aragonId, signers, neededSignatures)
                    daoAddress = getEventResult(receiptInstance, 'DeployInstance', 'dao')
                }

                // generated apps
                financeAddress = getAppProxy(receiptInstance, appIds[0])
                finance = await Finance.at(financeAddress)
                tokenManagerAddress = getAppProxy(receiptInstance, appIds[1])
                tokenManager = TokenManager.at(tokenManagerAddress)
                vaultAddress = getAppProxy(receiptInstance, appIds[2])
                vault = await Vault.at(vaultAddress)
                votingAddress = getAppProxy(receiptInstance, appIds[3])
                voting = Voting.at(votingAddress)
            })

            it('creates and initializes a DAO with its Token', async() => {
                assert.notEqual(tokenAddress, '0x0', 'Token not generated')
                assert.notEqual(daoAddress, '0x0', 'Instance not generated')

                // Check ENS assignment
                const aragonIdNamehash = namehash(`${aragonId}.aragonid.eth`)
                const resolvedAddr = await PublicResolver.at(await ens.resolver(aragonIdNamehash)).addr(aragonIdNamehash)
                assert.equal(resolvedAddr, daoAddress, "aragonId ENS name doesn't match")

                // Check token values
                const token = MiniMeToken.at(tokenAddress)
                assert.equal(await token.name(), tokenName, "token name doesn't match")
                assert.equal(await token.symbol(), tokenSymbol, "token symbol doesn't match")
            })

            it('has initialized all apps', async () => {
                assert.isTrue(await finance.hasInitialized(), 'finance not initialized')
                assert.isTrue(await tokenManager.hasInitialized(), 'tokenManager not initialized')
                assert.isTrue(await vault.hasInitialized(), 'vault not initialized')
                assert.isTrue(await voting.hasInitialized(), 'voting not initialized')
            })

            it('has correct permissions', async () => {
                const dao = await getContract('Kernel').at(daoAddress)
                const acl = await getContract('ACL').at(await dao.acl())

                const checkRole = async (appAddress, permission, managerAddress, appName='', roleName='', granteeAddress=managerAddress) => {
                    assert.equal(await acl.getPermissionManager(appAddress, permission), managerAddress, `${appName} ${roleName} Manager should match`)
                    assert.isTrue(await acl.hasPermission(granteeAddress, appAddress, permission), `Grantee should have ${appName} role ${roleName}`)
                }

                // app manager role
                await checkRole(daoAddress, await dao.APP_MANAGER_ROLE(), votingAddress, 'Kernel', 'APP_MANAGER')

                // create permissions role
                await checkRole(acl.address, await acl.CREATE_PERMISSIONS_ROLE(), votingAddress, 'ACL', 'CREATE_PERMISSION')

                // evm script registry
                const regConstants = await getContract('EVMScriptRegistryConstants').new()
                const reg = await getContract('EVMScriptRegistry').at(await acl.getEVMScriptRegistry())
                await checkRole(reg.address, await reg.REGISTRY_ADD_EXECUTOR_ROLE(), votingAddress, 'EVMScriptRegistry', 'ADD_EXECUTOR')
                await checkRole(reg.address, await reg.REGISTRY_MANAGER_ROLE(), votingAddress, 'EVMScriptRegistry', 'REGISTRY_MANAGER')

                // voting
                await checkRole(votingAddress, await voting.CREATE_VOTES_ROLE(), votingAddress, 'Voting', 'CREATE_VOTES', tokenManagerAddress)
                await checkRole(votingAddress, await voting.MODIFY_QUORUM_ROLE(), votingAddress, 'Voting', 'MODIFY_QUORUM')
                await checkRole(votingAddress, await voting.MODIFY_SUPPORT_ROLE(), votingAddress, 'Voting', 'MODIFY_SUPPORT')

                // vault
                await checkRole(vaultAddress, await vault.TRANSFER_ROLE(), votingAddress, 'Vault', 'TRANSFER', financeAddress)

                // finance
                await checkRole(financeAddress, await finance.CREATE_PAYMENTS_ROLE(), votingAddress, 'Finance', 'CREATE_PAYMENTS')
                await checkRole(financeAddress, await finance.EXECUTE_PAYMENTS_ROLE(), votingAddress, 'Finance', 'EXECUTE_PAYMENTS')
                await checkRole(financeAddress, await finance.MANAGE_PAYMENTS_ROLE(), votingAddress, 'Finance', 'MANAGE_PAYMENTS')

                // token manager
                await checkRole(tokenManagerAddress, await tokenManager.ASSIGN_ROLE(), votingAddress, 'TokenManager', 'ASSIGN')
                await checkRole(tokenManagerAddress, await tokenManager.REVOKE_VESTINGS_ROLE(), votingAddress, 'TokenManager', 'REVOKE_VESTINGS')
            })

            context('> Voting access', () => {
                it('set up voting correctly', async () => {
                    assert.equal((await voting.supportRequiredPct()).toString(), multisigSupport.toString(), 'support required not correct')
                    assert.equal((await voting.minAcceptQuorumPct()).toString(), multisigSupport.toString(), 'accept quorum not correct')
                    assert.equal((await voting.voteTime()).toString(), multisigVotingTime, 'voting time not correct')
                })

                it('cannot reinitialize voting', async () => {
                    try {
                        await voting.initialize(tokenAddress, 1e18, 1e18, 1000)
                    } catch (err) {
                        assert.equal(err.receipt.status, 0, "It should have thrown")
                        return
                    }
                    assert.isFalse(true, "It should have thrown")
                })

                it('fails trying to modify support threshold directly', async () => {
                    try {
                        await voting.changeSupportRequiredPct(multisigSupport.add(1), { from: owner })
                    } catch (err) {
                        assert.equal(err.receipt.status, 0, "It should have thrown")
                        return
                    }
                    assert.isFalse(true, "It should have thrown")
                })

                it('changes support threshold thru voting', async () => {
                    const action1 = { to: voting.address, calldata: voting.contract.changeSupportRequiredPct.getData(multisigSupport.add(1)) }
                    const script1 = encodeCallScript([action1])
                    const action2 = { to: voting.address, calldata: voting.contract.newVote.getData(script1, 'metadata') }
                    const script2 = encodeCallScript([action2])
                    const r1 = await tokenManager.forward(script2, { from: signer1 })
                    const voteId1 = getVoteId(r1)
                    await voting.vote(voteId1, true, true, { from: signer1 })
                    await voting.vote(voteId1, true, true, { from: signer2 })
                    const supportThreshold1 = await voting.supportRequiredPct()
                    assert.equal(supportThreshold1.toString(), multisigSupport.add(1).toString(), 'Support should have changed')
                    const vote = await voting.getVote(voteId1)
                    assert.equal(vote[4].toString(), multisigSupport.toString(), 'Support for previous vote should not have changed')

                    // back to original value
                    const action3 = { to: voting.address, calldata: voting.contract.changeSupportRequiredPct.getData(multisigSupport) }
                    const script3 = encodeCallScript([action3])
                    const action4 = { to: voting.address, calldata: voting.contract.newVote.getData(script3, 'metadata') }
                    const script4 = encodeCallScript([action4])
                    const r2 = await tokenManager.forward(script4, { from: signer1 })
                    const voteId2 = getVoteId(r2)
                    await voting.vote(voteId2, true, true, { from: signer1 })
                    await voting.vote(voteId2, true, true, { from: signer2 })
                    await voting.vote(voteId2, true, true, { from: signer3 })
                    const supportThreshold2 = await voting.supportRequiredPct()
                    assert.equal(supportThreshold2.toString(), multisigSupport.toString(), 'Support should have changed again')
                })

                context('> Creating vote', () => {
                    let voteId
                    let executionTarget

                    beforeEach(async () => {
                        executionTarget = await getContract('ExecutionTarget').new()
                        const action = { to: executionTarget.address, calldata: executionTarget.contract.execute.getData() }
                        script = encodeCallScript([action])
                        const action2 = { to: voting.address, calldata: voting.contract.newVote.getData(script, 'metadata') }
                        const script2 = encodeCallScript([action2])
                        const r = await tokenManager.forward(script2, { from: signer1 })
                        voteId = getVoteId(r)
                    })

                    it('has correct state', async() => {
                        const [isOpen, isExecuted, startDate, snapshotBlock, requiredSupport, minQuorum, y, n, totalVoters, execScript] = await voting.getVote(voteId)

                        assert.isTrue(isOpen, 'vote should be open')
                        assert.isFalse(isExecuted, 'vote should be executed')
                        assert.equal(snapshotBlock.toString(), await getBlockNumber() - 1, 'snapshot block should be correct')
                        assert.equal(requiredSupport.toString(), multisigSupport.toString(), 'min quorum should be app min quorum')
                        assert.equal(minQuorum.toString(), multisigSupport.toString(), 'min quorum should be app min quorum')
                        assert.equal(y, 0, 'initial yea should be 0')
                        assert.equal(n, 0, 'initial nay should be 0')
                        assert.equal(totalVoters.toString(), signers.length, 'total voters should be number of signers')
                        assert.equal(execScript, script, 'script should be correct')
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

                    it('throws when non-holder tries to create a vote directly', async () => {
                        const action = { to: executionTarget.address, calldata: executionTarget.contract.execute.getData() }
                        script = encodeCallScript([action])
                        try {
                            await voting.newVote(script, 'metadata', { from: nonHolder })
                        } catch (err) {
                            assert.equal(err.receipt.status, 0, "It should have thrown")
                            return
                        }
                        assert.isFalse(true, "It should have thrown")
                    })

                    it('throws when non-holder tries to create a vote thru token manager', async () => {
                        const action = { to: executionTarget.address, calldata: executionTarget.contract.execute.getData() }
                        script = encodeCallScript([action])
                        const action2 = { to: voting.address, calldata: voting.contract.newVote.getData(script, 'metadata') }
                        const script2 = encodeCallScript([action2])
                        try {
                            await tokenManager.forward(script2, { from: nonHolder })
                        } catch (err) {
                            assert.equal(err.receipt.status, 0, "It should have thrown")
                            return
                        }
                        assert.isFalse(true, "It should have thrown")
                    })

                    it('throws when non-holder votes', async () => {
                        try {
                            await voting.vote(voteId, true, true, { from: nonHolder })
                        } catch (err) {
                            assert.equal(err.receipt.status, 0, "It should have thrown")
                            return
                        }
                        assert.isFalse(true, "It should have thrown")
                    })

                    it('automatically executes if vote is approved by enough signers', async () => {
                        await voting.vote(voteId, true, true, { from: signer2 })
                        await voting.vote(voteId, true, true, { from: signer1 })
                        assert.equal((await executionTarget.counter()).toString(), 1, 'should have executed result')
                    })

                    it('cannot execute vote if not enough signatures', async () => {
                        await voting.vote(voteId, true, true, { from: signer1 })
                        assert.equal(await executionTarget.counter(), 0, 'should have not executed result')
                        try {
                            await voting.executeVote(voteId, {from: owner})
                        } catch (err) {
                            assert.equal(err.receipt.status, 0, "It should have thrown")
                            return
                        }
                        assert.isFalse(true, "It should have thrown")
                    })
                })

                context('> Finance access', () => {
                    let voteId, script
                    const payment = new web3.BigNumber(2e16)

                    beforeEach(async () => {
                        // Fund Finance
                        //await logBalances(financeAddress, vaultAddress)
                        await finance.sendTransaction({ value: payment, from: owner })
                        //await logBalances(financeAddress, vaultAddress)
                        const action = { to: financeAddress, calldata: finance.contract.newImmediatePayment.getData(ETH, nonHolder, payment, "voting payment") }
                        script = encodeCallScript([action])
                        const action2 = { to: voting.address, calldata: voting.contract.newVote.getData(script, 'metadata') }
                        const script2 = encodeCallScript([action2])
                        const r = await tokenManager.forward(script2, { from: signer1 })
                        voteId = getVoteId(r)
                    })

                    it('finance can not be accessed directly (without a vote)', async () => {
                        try {
                            await finance.newImmediatePayment(ETH, nonHolder, 2e16, "voting payment")
                        } catch (err) {
                            assert.equal(err.receipt.status, 0, "It should have thrown")
                            return
                        }
                        assert.isFalse(true, "It should have thrown")
                    })

                    it('transfers funds if vote is approved', async () => {
                        const receiverInitialBalance = await getBalance(nonHolder)
                        //await logBalances(financeAddress, vaultAddress)
                        await voting.vote(voteId, true, true, { from: signer2 })
                        await voting.vote(voteId, true, true, { from: signer1 })
                        //await logBalances(financeAddress, vaultAddress)
                        assert.equal((await getBalance(nonHolder)).toString(), receiverInitialBalance.plus(payment).toString(), 'Receiver didn\'t get the payment')
                    })
                })
            })
        })
    }

    const logBalances = async(financeAddress, vaultAddress) => {
        console.log('Owner ETH: ' + await getBalance(owner))
        console.log('Finance ETH: ' + await getBalance(financeAddress))
        console.log('Vault ETH: ' + await getBalance(vaultAddress))
        console.log('Receiver ETH: ' + await getBalance(nonHolder))
        console.log('-----------------')
    }

    const sleep = function(s) {
        return new Promise(resolve => setTimeout(resolve, s*1000));
    }
})
