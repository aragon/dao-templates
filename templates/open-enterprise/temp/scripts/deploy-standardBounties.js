const logDeploy = require('@aragon/os/scripts/helpers/deploy-logger')
const getAccounts = require('@aragon/os/scripts/helpers/get-accounts')

const globalArtifacts = this.artifacts // Not injected unless called directly via truffle
const globalWeb3 = this.web3 // Not injected unless called directly via truffle

const defaultOwner = process.env.OWNER

module.exports = async (
  truffleExecCallback,
  {
    artifacts = globalArtifacts,
    web3 = globalWeb3,
    owner = defaultOwner,
    verbose = true
  } = {}
) => {
  const log = (...args) => {
    if (verbose) { console.log(...args) }
  }

  if (!owner) {
    const accounts = await getAccounts(web3)
    owner = accounts[0]
    log(`No OWNER environment variable passed, setting StandardBounties owner to provider's account: ${owner}`)
  }

  // TODO: we do this externally for now, this script is not called right now
  // const standardBounties = artifacts.require('StandardBounties')
  // log('Deploying StandardBounties...')
  // const standardBountiesBase = await standardBounties.new(owner)
  // await logDeploy(standardBountiesBase, { verbose })

  if (typeof truffleExecCallback === 'function') {
    // Called directly via `truffle exec`
    truffleExecCallback()
  } else {
    return {
      // standardBounties: standardBountiesBase
      standardBounties: { address: 0 }
    }
  }
}

