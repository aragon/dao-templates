const { hash: namehash } = require('eth-ens-namehash')

const BASE_APPS = [
  { name: 'agent', contractName: 'Agent' },
  { name: 'vault', contractName: 'Vault' },
  { name: 'finance', contractName: 'Finance' },
  { name: 'token-manager', contractName: 'TokenManager' }
  // { name: 'voting', contractName: 'Voting' },
  // { name: 'survey', contractName: 'Survey' },
  // { name: 'payroll', contractName: 'Payroll' },
]

const DANDELION_APPS = [
  { name: 'dandelion-voting', contractName: 'DandelionVoting' },
  { name: 'redemptions', contractName: 'Redemptions' },
  { name: 'token-request', contractName: 'TokenRequest' },
  { name: 'time-lock', contractName: 'TimeLock' },
  { name: 'token-balance-oracle', contractName: 'TokenBalanceOracle' },
]

const BASE_APP_IDS = BASE_APPS.reduce((ids, { name }) => {
  ids[name] = namehash(`${name}.aragonpm.eth`)
  return ids
}, {})

const DANDELION_APP_IDS = DANDELION_APPS.reduce((ids, { name }) => {
  ids[name] = namehash(`${name}.open.aragonpm.eth`)
  return ids
}, {})

module.exports = {
  APPS: [...BASE_APPS, ...DANDELION_APPS],
  APP_IDS: { ...BASE_APP_IDS, ...DANDELION_APP_IDS },
}
