const { hash: namehash } = require('eth-ens-namehash')

const APPS = [
  { name: 'agent', contractName: 'Agent' },
  { name: 'vault', contractName: 'Vault' },
  { name: 'voting', contractName: 'Voting' },
  { name: 'survey', contractName: 'Survey' },
  { name: 'payroll', contractName: 'Payroll' },
  { name: 'finance', contractName: 'Finance' },
  { name: 'token-manager', contractName: 'TokenManager' },
]

const APP_IDS = APPS.reduce((ids, { name }) => {
  ids[name] = namehash(`${name}.aragonpm.eth`)
  return ids
}, {})

module.exports = {
  APPS,
  APP_IDS,
}
