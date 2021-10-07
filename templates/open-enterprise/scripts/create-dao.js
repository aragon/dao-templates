/* global artifacts, web3 */
const { randomId } = require('@aragon/templates-shared/helpers/aragonId')
const newDAO = require('../temp/scripts/new-dao')


const VOTE_DURATION = 60 // seconds
const SUPPORT_REQUIRED = 50e16 // 0 = 0%; 50e16 = 50%
const MIN_ACCEPTANCE_QUORUM = 20e16 // 20e16 = 20%

// define template params
const settings = {
  allocationsPeriod: 0,
  // The order is important
  dotVotingSettings: [ SUPPORT_REQUIRED, MIN_ACCEPTANCE_QUORUM, VOTE_DURATION ],
  financePeriod: 0,
  id: randomId(),
  members: [
    '0xb4124cEB3451635DAcedd11767f004d8a28c6eE7',
    '0x8401Eb5ff34cc943f096A32EF3d5113FEbE8D4Eb',
  ],
  stakes: [
    '1000000000000000000',
    '100000000000000000',
  ],
  token: { name: 'Autark Coin', symbol: 'AUT' },
  useDiscussions: true,
  // The order is important for now. TODO: make it an object instead
  votingSettings: [ SUPPORT_REQUIRED, MIN_ACCEPTANCE_QUORUM, VOTE_DURATION ],
}

// create new dao
module.exports = callback => newDAO({ artifacts, callback, settings, web3 })
