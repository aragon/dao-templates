const namehash = require('eth-ens-namehash').hash
const keccak256 = require('js-sha3').keccak_256

const getContract = name => artifacts.require(name)
const getEvent = (receipt, event, arg) => { return receipt.logs.filter(l => l.event == event)[0].args[arg] }
const getVoteId = (receipt) => {
  const logs = receipt.receipt.logs.filter(
    l =>
      l.topics[0] == web3.sha3('NewVote(uint256)')
  )
  return web3.toDecimal(logs[0].data)
}
const getApp = (receipt, app, index) => { return receipt.logs.filter(l => l.event == 'InstalledApp' && l.args['appId'] == namehash(app))[index].args['appProxy'] }
const pct16 = x => new web3.BigNumber(x).times(new web3.BigNumber(10).toPower(16))
const getTimestamp = async () => await web3.eth.getBlock(web3.eth.blockNumber).timestamp
const sleep = (s) => new Promise((resolve) =>  setTimeout(resolve, s * 1000))
const waitUntil = async (time) => {
  const timestamp = await getTimestamp()
  if (timestamp < time) {
    await sleep(time - timestamp + 1)
  }
}

contract("TCR",  (accounts) => {
  const [owner, applicant, challenger, voter, _] = accounts
  const network = 'devnet'
  let indexObj = require('../index_local.js')
  let tokenObj = require('../../../helpers/test-token-deployer/index.js')
  //const ENS = indexObj.networks[network].ens
  //const OWNER = indexObj.networks[network].owner
  const tcrKitAddress = indexObj.networks[network].tcr_kit
  const tokenAddress = tokenObj[network].tokens[0]
  const tokenFactoryAddress = tokenObj[network].factory
  const voteQuorum = pct16(50)
  const minorityBlocSlash = pct16(40)
  const commitDuration = 30 // increase if commit vote txs fail
  const revealDuration = 30 // increase if reveal vote txs fail
  const minDeposit = 1000
  const applyStageLen = 900
  const dispensationPct = pct16(50)
  const voteStake = 100

  const TIME_UNIT_BLOCKS = 0
  const TIME_UNIT_SECONDS = 1
  let MAX_UINT64

  const salt = 'salt'.repeat(8)

  let token, curation, staking, voteStaking, registry, plcr

  before(async () => {
    const TCRKit = getContract('TCRKit').at(tcrKitAddress)
    const r1 = await TCRKit.newInstance(owner, tokenAddress, voteQuorum, minorityBlocSlash, commitDuration, revealDuration)
    assert.equal(r1.receipt.status, '0x1', "New TCRKit transaction should succeed")
    staking = getContract('Staking').at(getApp(r1, 'staking.aragonpm.eth', 0))
    voteStaking = getContract('Staking').at(getApp(r1, 'staking.aragonpm.eth', 1))
    curation = getContract('Curation').at(getApp(r1, 'tcr.aragonpm.eth', 0))
    registry = getContract('RegistryApp').at(getApp(r1, 'registry.aragonpm.eth', 0))
    plcr = getContract('PLCR').at(getApp(r1, 'plcr.aragonpm.eth', 0))
    console.log('registry:    ', registry.address)
    console.log('staking:     ', staking.address)
    console.log('voteStaking: ', voteStaking.address)
    console.log('plcr:        ', plcr.address)
    console.log('curation:    ', curation.address)
    MAX_UINT64 = await curation.MAX_UINT64()
    await TCRKit.initCuration(minDeposit, applyStageLen, dispensationPct)
    token = getContract('ERC20').at(tokenAddress)
    // send some eth to users to pay for gas
    await web3.eth.sendTransaction({ from: owner, to: applicant, value: web3.toWei(1, 'ether') })
    await web3.eth.sendTransaction({ from: owner, to: challenger, value: web3.toWei(1, 'ether') })
    await web3.eth.sendTransaction({ from: owner, to: voter, value: web3.toWei(1, 'ether') })
  })

  beforeEach(async () => {
    // mint tokens
    await Promise.all(accounts.map(async (account) => {
      await getContract('TokenFactory').at(tokenFactoryAddress).mint(tokenAddress, account, minDeposit)
      await getContract('TokenFactory').at(tokenFactoryAddress).mint(tokenAddress, account, voteStake)
    }))
  })

  const approveStakeLock = async (stakingContract, unlocker, user, amount, time) => {
    // approve
    const approveReceipt = await token.approve(stakingContract.address, amount, { from: user })
    assert.equal(approveReceipt.receipt.status, '0x1', "Approve transaction should succeed")
    // stake
    const stakeReceipt = await stakingContract.stake(amount, "", { from: user })
    assert.equal(stakeReceipt.receipt.status, '0x1', "Staking transaction should succeed")
    // lock
    const lockReceipt = await stakingContract.lock(amount, TIME_UNIT_SECONDS, time, unlocker, "", "", { from: user })
    assert.equal(lockReceipt.receipt.status, '0x1', "Lock transaction should succeed")
    const lockId = getEvent(lockReceipt, 'Locked', 'lockId')

    return lockId
  }
  const approveStakeLockForApplication = async (user, amount) => {
    return await approveStakeLock(staking, curation.address, user, amount, MAX_UINT64)
  }
  const approveStakeLockForChallenge = async (user, amount) => {
    return await approveStakeLock(staking, curation.address, user, amount, (await getTimestamp()) + applyStageLen + 1000)
  }
  const approveStakeLockForVoting = async (user, amount) => {
    return await approveStakeLock(voteStaking, plcr.address, user, amount, (await getTimestamp()) + commitDuration + revealDuration + 1000)
  }

  const secretHash = (voteOption) => {
    let node = keccak256(voteOption ? '1' : '0')
    node = keccak256(new Buffer(node + keccak256(salt), 'hex'))
    return '0x' + node
  }

  const commitVote = async (voteId, user, voteOption, stake) => {
    const votingLockId = await approveStakeLockForVoting(user, stake)
    const commitReceipt = await plcr.commitVote(voteId, secretHash(voteOption), votingLockId, { from: user })
    const vote = await plcr.getVote.call(voteId)
    const lock = await voteStaking.getLock.call(user, votingLockId)
    assert.equal(commitReceipt.receipt.status, '0x1', "Commit Vote transaction should succeed")
  }

  const fullCycle = async (result, data) => {
    const winner = result ? challenger : applicant
    const loser = result ? applicant : challenger

    // create application
    const appLockId = await approveStakeLockForApplication(applicant, minDeposit)
    console.log('application lockId', appLockId.toString())
    const applyReceipt = await curation.newApplication(data, appLockId, { from: applicant })
    assert.equal(applyReceipt.receipt.status, '0x1', "Application transaction should succeed")
    const entryId = getEvent(applyReceipt, 'NewApplication', 'entryId')

    // challenge
    const challengeLockId = await approveStakeLockForChallenge(challenger, minDeposit)
    console.log('entryId', entryId)
    console.log('challenge lockId', challengeLockId.toString())
    const challengeReceipt = await curation.challengeApplication(entryId, challengeLockId, { from: challenger })
    assert.equal(challengeReceipt.receipt.status, '0x1', "Challenge transaction should succeed")
    assert.equal(entryId, getEvent(challengeReceipt, 'NewChallenge', 'entryId'), "Challenge entry Id should match with the one from new application")
    const voteId = getVoteId(challengeReceipt)
    console.log('voteId', voteId.toString())

    // commit votes
    const vote = await plcr.getVote(voteId)
    await commitVote(voteId, applicant, false, voteStake) // applicant votes against challenge
    await commitVote(voteId, challenger, true, voteStake)  // challenger votes for challenge
    await commitVote(voteId, voter, result, voteStake) // 3rd user unties

    // wait commit time
    const commitEnd = vote[0]
    await waitUntil(commitEnd)

    const voteStakingInitialWinnerBalance = await voteStaking.unlockedBalanceOf.call(winner)
    const voteStakingInitialLoserBalance = await voteStaking.unlockedBalanceOf.call(loser)
    const voteStakingInitialVoterBalance = await voteStaking.unlockedBalanceOf.call(voter)

    // reveal votes
    await plcr.revealVote(voteId, false, salt, { from: applicant })
    await plcr.revealVote(voteId, true, salt, { from: challenger })
    await plcr.revealVote(voteId, result, salt, { from: voter })

    // check balances
    const voteStakingRevealWinnerBalance = await voteStaking.unlockedBalanceOf.call(winner)
    const voteStakingRevealLoserBalance = await voteStaking.unlockedBalanceOf.call(loser)
    const voteStakingRevealVoterBalance = await voteStaking.unlockedBalanceOf.call(voter)
    const votingReward = voteStake * minorityBlocSlash / 1e18
    assert.equal(voteStakingRevealWinnerBalance.toString(), parseInt(voteStakingInitialWinnerBalance, 10) + voteStake - votingReward, "Winner Voting stake should match")
    assert.equal(voteStakingRevealLoserBalance.toString(), parseInt(voteStakingInitialLoserBalance, 10) + voteStake - votingReward, "Loser Voting stake should match")
    assert.equal(voteStakingRevealVoterBalance.toString(), parseInt(voteStakingInitialVoterBalance, 10) + voteStake - votingReward, "Voter Voting stake should match")

    // wait reveal time
    const revealEnd = vote[1]
    await waitUntil(revealEnd)

    // resolve challenge
    const stakingWinnerBalance = await staking.unlockedBalanceOf.call(winner)
    const stakingLoserBalance = await staking.unlockedBalanceOf.call(loser)
    const stakingVoterBalance = await staking.unlockedBalanceOf.call(voter)
    const dispensationReward = minDeposit * dispensationPct / 1e18

    const resolveReceipt = await curation.resolveChallenge(entryId)

    // checks
    const voteResult = await plcr.getVoteResult.call(voteId)
    assert.equal(resolveReceipt.receipt.status, '0x1', "Resolve transaction should succeed")
    assert.equal(voteResult[0], result, "Vote result should match")
    assert.equal(getEvent(resolveReceipt, 'ResolvedChallenge', 'result'), result, "Resolve challenge result should match")

    // check that application has been registered
    const entryExists = await registry.exists(entryId)
    assert.equal(entryExists, !result, "Entry existence in Registry App is wrong")

    // check balances
    const stakingWinnerResolvedBalance = await staking.unlockedBalanceOf.call(winner)
    const stakingLoserResolvedBalance = await staking.unlockedBalanceOf.call(loser)
    const stakingVoterResolvedBalance = await staking.unlockedBalanceOf.call(voter)
    assert.equal(stakingWinnerResolvedBalance.toString(), parseInt(stakingWinnerBalance, 10) + dispensationReward, "Winner balance should match")
    assert.equal(stakingLoserResolvedBalance.toString(), parseInt(stakingLoserBalance, 10), "Loser balance should match")
    assert.equal(stakingVoterResolvedBalance.toString(), parseInt(stakingVoterBalance, 10), "Voter balance should match")

    // claim rewards
    const remainingReward = minDeposit - dispensationReward
    const claimReceipt1 = await curation.claimReward(entryId, { from: winner })
    assert.equal(claimReceipt1.receipt.status, '0x1', "Winner claim transaction should succeed")
    assert.equal((await staking.unlockedBalanceOf.call(winner)).toString(), parseInt(stakingWinnerResolvedBalance, 10) + remainingReward / 2, "Winner balance should match")

    /* TODO: fails because of gas?
    const claimReceipt2 = await curation.claimReward(entryId, { from: voter })
    assert.equal(claimReceipt2.receipt.status, '0x1', "Voter claim transaction should succeed")
     assert.equal((await staking.unlockedBalanceOf.call(winner)).toString(), parseInt(stakingWinnerResolvedBalance, 10) + remainingReward / 2, "Winner balance should match")
     */

    // claim from Voting app
    const claimVotingReceipt1 = await plcr.claimTokens(voteId, { from: winner })
    assert.equal(claimVotingReceipt1.receipt.status, '0x1', "Winner claim to Voting app transaction should succeed")
    const claimVotingReceipt2 = await plcr.claimTokens(voteId, { from: voter })
    assert.equal(claimVotingReceipt2.receipt.status, '0x1', "Voter claim to Voting app transaction should succeed")
    const claimVotingReceipt3 = await plcr.claimTokens(voteId, { from: loser })
    assert.equal(claimVotingReceipt3.receipt.status, '0x1', "Loser claim to Voting app transaction should succeed")
    assert.equal((await voteStaking.unlockedBalanceOf.call(winner)).toString(), parseInt(voteStakingRevealWinnerBalance, 10) + votingReward * 3/ 2, "Vote Staking Winner balance should match")
    assert.equal((await voteStaking.unlockedBalanceOf.call(loser)).toString(), parseInt(voteStakingRevealLoserBalance, 10), "Vote Staking Loser balance should match")
    assert.equal((await voteStaking.unlockedBalanceOf.call(voter)).toString(), parseInt(voteStakingRevealVoterBalance, 10) + votingReward * 3 / 2, "Vote Staking Voter balance should match")
  }

  it('creates new application, challenges it, rejects challenge', async () => {
    await fullCycle(false, "test-reject-" + Math.random() * 1000)
  })

  it('creates new application, challenges it, accepts challenge', async () => {
    await fullCycle(true, "test-accept-" + Math.random() * 1000)
  })
})
