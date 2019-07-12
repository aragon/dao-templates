const { hash: namehash } = require('eth-ens-namehash')

const APPS = [
  { id: 'agent', contractName: 'Agent' },
  { id: 'vault', contractName: 'Vault' },
  { id: 'voting', contractName: 'Voting' },
  { id: 'finance', contractName: 'Finance' },
  { id: 'token-manager', contractName: 'TokenManager' },
]

const APP_IDS = APPS.reduce((ids, { id }) => {
  ids[id] = namehash(`${id}.aragonpm.eth`)
  return ids
}, {})

module.exports = {
  APPS,
  APP_IDS,
}
