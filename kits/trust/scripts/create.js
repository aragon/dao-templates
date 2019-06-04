const fs = require('fs')
const { hash } = require('eth-ens-namehash')
const { isAddress } = require('web3-utils')
const { getEventArgument } = require('../helpers/events')
const { getAddressesFileName, getDeployedAddresses } = require('../helpers/arapp')

const isArray = (e, l = 0) => Array.isArray(e) && (l === 0 || e.length === l)
const isArrayOfAddresses = (e, l = 0) => isArray(e, l) && e.every(isAddress)
const validHeirsStake = stakes => stakes.reduce((t, i) => t.plus(new web3.BigNumber(i)), new web3.BigNumber(0)).mul(100).mod(66).eq(0)

const existsJson = path => {
  if (path.split('.').pop() !== 'json' || !fs.existsSync(path)) return false;
  try {
    JSON.parse(fs.readFileSync(path))
    return true
  } catch(e) {
    return false
  }
}

const validId = id => {
  if (!id) return false
  try {
    hash(id)
    return true
  } catch(e) {
    return false
  }
}

const errorOut = msg => {
  console.log()
  console.error(msg)
  throw new Error(msg)
}

const parseInput = () => {
  const inputFilePath = process.argv[6]
  if (!existsJson(inputFilePath)) errorOut(`You must provide a valid input JSON file with structure: \n{\n  "id": <id>,\n  "beneficiaries": [<address1>, <address2>],\n  "multiSigKeys": [<address1>, <address2>],\n  "heirs": [<address1>, ..., <addressN>],\n  "heirsStake": [<stake1>, ..., <stakeN>]\n}`)
  const input = JSON.parse(fs.readFileSync(inputFilePath))

  if (!validId(input.id)) errorOut(`You must provide a valid id for your DAO as "id" in ${inputFilePath}`)
  if (!isArrayOfAddresses(input.multiSigKeys, 2)) errorOut(`You must provide two valid multisig addresses as "multiSigKeys" in ${inputFilePath}`)
  if (!isArrayOfAddresses(input.beneficiaries, 2)) errorOut(`You must provide two valid beneficiary addresses as "beneficiaries" in ${inputFilePath}`)
  if (!isArrayOfAddresses(input.heirs)) errorOut(`You must provide a list of valid heir addresses as "heirs" in ${inputFilePath}`)
  if (!isArray(input.heirsStake, input.heirs.length)) errorOut(`You must provide a valid list of heirs stake as "heirsStake" in ${inputFilePath}`)
  if (!validHeirsStake(input.heirsStake)) errorOut('Total heirs stake must be a integer number representing 66% of total heirs supply (e.g. [33e18, 33e18])')

  return input
}

async function create() {
  if (process.argv.length !== 7) errorOut('Usage: truffle exec --network <network> ./scripts/create.js <json_input_file>')
  const network = process.argv[4]

  const deployedAddresses = await getDeployedAddresses(network)
  const { address: trustKitAddress } = deployedAddresses || {}
  if (!trustKitAddress) errorOut(`Missing trust kit address for network ${network} in ${await getAddressesFileName(network)}`)
  else console.log(`Using trust kit deployed at ${trustKitAddress}...`)

  const TrustKit = artifacts.require('TrustKit')
  const trustKit = TrustKit.at(trustKitAddress)
  const { id, multiSigKeys, beneficiaries, heirs, heirsStake } = parseInput()

  console.log('Preparing DAO...')
  await trustKit.prepareDAO()
  console.log('Setting up DAO...')
  await trustKit.setupDAO(id, beneficiaries, heirs, heirsStake)
  console.log('Setting up multi signature wallet...')
  const receipt = await trustKit.setupMultiSig(multiSigKeys)
  console.log('Trust entity deployed successfully!')

  const dao = getEventArgument(receipt, 'DeployTrustEntity', 'dao')
  const multiSig = getEventArgument(receipt, 'DeployTrustEntity', 'multiSig')
  console.log(`\n=======\nDAO: ${dao}\nMultiSig: ${multiSig}\n=======`)
}

module.exports = callback => {
  create().then(() => callback()).catch(err => callback(err))
}
