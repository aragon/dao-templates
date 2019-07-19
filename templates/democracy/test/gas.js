const { deployedAddresses } = require('@aragon/templates-shared/lib/arapp-file')(web3)

const DemocracyTemplate = artifacts.require('DemocracyTemplate')

const pct16 = x => new web3.BigNumber(x).times(new web3.BigNumber(10).toPower(16))

// `npm run test` needs to be run first so arapp_local.json gets created
// then you can run it with `truffle test --network devnet test/gas.js`
// having a docker geth image running (`npm run docker:run && npm run docker:wait-gas`)

contract('Democracy gas', ([owner, holder20, holder29, holder51]) => {
  let template

  const votingTime = 10
  const neededSupport = pct16(50)
  const minimumAcceptanceQuorum = pct16(20)

  before('fetch multisig template', async () => {
    const { address } = await deployedAddresses()
    template = DemocracyTemplate.at(address)
  })

  context('use template', async () => {
    it('create token', async () => {
      await template.newToken('DemocracyToken', 'DTT', { from: owner })
    })

    it('create new instance', async () => {
      const holders = [holder20, holder29, holder51]
      const stakes = [20e18, 29e18, 51e18]

      const id = 'DemocracyDao-' + Math.random() * 1000
      await template.newInstance(id, holders, stakes, neededSupport, minimumAcceptanceQuorum, votingTime, { from: owner })
    })
  })
})
