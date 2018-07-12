const fs = require('fs')
const namehash = require('eth-ens-namehash').hash

const getContract = name => artifacts.require(name)
const getApp = (receipt, app, index) => { return receipt.logs.filter(l => l.event == 'InstalledApp' && l.args['appId'] == namehash(app))[index].args['appProxy'] }
const pct16 = x => new web3.BigNumber(x).times(new web3.BigNumber(10).toPower(16))

const errorOut = msg => { console.error(msg); process.exit(1) }

module.exports = async callback => {
  if (process.argv.length < 8) {
    errorOut('Usage: truffle exec --network <network> scripts/deploy_tcr.js <params_file> <result_file>')
  }

  // get network
  const network = process.argv[4]

  // get config
  let indexFileName
  if (network != 'rpc' && network != 'devnet') {
    indexFileName = 'index.js'
  } else {
    indexFileName = 'index_local.js'
  }
  const indexObj = require('../' + indexFileName)
  const tokenObj = require('../../../helpers/test-token-deployer/index.js')
  //const ENS = indexObj.networks[network].ens
  const owner = indexObj.networks[network].owner
  const tcrKitAddress = indexObj.networks[network].tcr_kit
  const tokenAddress = tokenObj[network].tokens[0]
  //const tokenFactoryAddress = tokenObj[network].factory

  console.log('owner', owner)
  console.log('tcrKitAddress', tcrKitAddress)
  console.log('tokenAddress', tokenAddress)

  const paramsObj = require(process.argv[6])
  const resultFileName = process.argv[7]
  console.log(paramsObj)
  // curation params
  const minDeposit = paramsObj['minDeposit']
  const applyStageLen = paramsObj['applyStageLen']
  const dispensationPct = pct16(paramsObj['dispensationPct'])
  // voting params
  const voteQuorum = pct16(paramsObj['voteQuorum'])
  const minorityBlocSlash = pct16(paramsObj['minorityBlocSlash'])
  const commitDuration = paramsObj['commitDuration']
  const revealDuration = paramsObj['revealDuration']

  //await getContract('TokenFactory').at(tokenFactoryAddress).mint(tokenAddress, owner, minDeposit)

  const TCRKit = getContract('TCRKit').at(tcrKitAddress)
  const r1 = await TCRKit.newInstance(owner, tokenAddress, voteQuorum, minorityBlocSlash, commitDuration, revealDuration)
  if (r1.receipt.status != '0x1') {
    console.log(r1)
    errorOut("New TCRKit transaction should succeed")
  }
  const staking = getContract('Staking').at(getApp(r1, 'staking.aragonpm.eth', 0))
  const voteStaking = getContract('Staking').at(getApp(r1, 'staking.aragonpm.eth', 1))
  const curation = getContract('Curation').at(getApp(r1, 'tcr.aragonpm.eth', 0))
  const registry = getContract('RegistryApp').at(getApp(r1, 'registry.aragonpm.eth', 0))
  const plcr = getContract('PLCR').at(getApp(r1, 'plcr.aragonpm.eth', 0))
  //const MAX_UINT64 = await curation.MAX_UINT64()
  const r2 = await TCRKit.initCuration(minDeposit, applyStageLen, dispensationPct)
  if (r2.receipt.status != '0x1') {
    console.log(r2)
    console.error("TCRKit initCuration transaction should succeed")
  }
  //const token = getContract('ERC20').at(tokenAddress)

  let resultObj = {}
  resultObj['registry'] = registry.address
  resultObj['staking'] = staking.address
  resultObj['voteStaking'] = voteStaking.address
  resultObj['plcr'] = plcr.address
  resultObj['curation'] = curation.address
  fs.writeFileSync(resultFileName, JSON.stringify(resultObj, null, 2))
  console.log('Result saved to ' + resultFileName)

}
