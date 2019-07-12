const fs = require('fs')
const { hash } = require('eth-ens-namehash')
const { isAddress } = require('web3-utils')
const { getEventArgument } = require('@aragon/test-helpers/events')
const { fileName, deployedAddresses } = require('@aragon/templates-shared/lib/ArappFile')(web3)

const isArray = (e, l = 0) => Array.isArray(e) && (l === 0 || e.length === l)
const isArrayOfAddresses = (e, l = 0) => isArray(e, l) && e.every(isAddress)

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
  if (!existsJson(inputFilePath)) errorOut(`You must provide a valid input JSON file with structure: \n{\n  "id": <id>,\n  "beneficiaries": [<address1>, <address2>],\n  "multiSigKeys": [<address1>, <address2>],\n  "heirs": [<address1>, ..., <addressN>]\n}`)
  const input = JSON.parse(fs.readFileSync(inputFilePath))

  if (!validId(input.id)) errorOut(`You must provide a valid id for your DAO as "id" in ${inputFilePath}`)
  if (!isArrayOfAddresses(input.multiSigKeys, 2)) errorOut(`You must provide two valid multisig addresses as "multiSigKeys" in ${inputFilePath}`)
  if (!isArrayOfAddresses(input.beneficiaries, 2)) errorOut(`You must provide two valid beneficiary addresses as "beneficiaries" in ${inputFilePath}`)
  if (!isArrayOfAddresses(input.heirs)) errorOut(`You must provide a list of valid heir addresses as "heirs" in ${inputFilePath}`)

  const heirsStake = input.heirs.length * 66 * 1e18
  const heirsStakes = input.heirs.map(() => heirsStake)
  return { ...input, heirsStakes }
}

async function create() {
  if (process.argv.length !== 7) errorOut('Usage: truffle exec --network <network> ./scripts/create.js <json_input_file>')
  const network = process.argv[4]

  const { address: trustTemplateAddress } = (await deployedAddresses()) || {}
  if (!trustTemplateAddress) errorOut(`Missing trust template address for network ${network} in ${await fileName()}`)
  else console.log(`Using trust template deployed at ${trustTemplateAddress}...`)

  const TrustTemplate = artifacts.require('TrustTemplate')
  const trustTemplate = TrustTemplate.at(trustTemplateAddress)
  const { id, multiSigKeys, beneficiaries, heirs, heirsStakes } = parseInput()

  console.log('Preparing DAO...')
  await trustTemplate.prepareDAO()
  console.log('Setting up DAO...')
  await trustTemplate.setupDAO(id, beneficiaries, heirs, heirsStakes)
  console.log('Setting up multi signature wallet...')
  const receipt = await trustTemplate.setupMultiSig(multiSigKeys)
  console.log('Trust entity deployed successfully!')

  const dao = getEventArgument(receipt, 'DeployDao', 'dao')
  const multiSig = getEventArgument(receipt, 'DeployMultiSig', 'multiSig')
  console.log(`\n=======\nDAO: ${dao}\nMultiSig: ${multiSig}\n=======`)
}

module.exports = callback => {
  create().then(() => callback()).catch(err => callback(err))
}
