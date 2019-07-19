const { deployedAddresses } = require('@aragon/templates-shared/lib/arapp-file')(web3)

const MultisigTemplate = artifacts.require('MultisigTemplate')

// `npm run test` needs to be run first so arapp_local.json gets created
// then you can run it with `truffle test --network devnet test/gas.js`
// having a docker geth image running (`npm run docker:run && npm run docker:wait-gas`)

contract('Multisig gas', ([owner, signer1, signer2, signer3]) => {
  let template

  before('fetch multisig template', async () => {
    const { address } = await deployedAddresses()
    template = MultisigTemplate.at(address)
  })

  context('use template', async () => {
    it('create token', async () => {
      await template.newToken('MultisigToken', 'MST', { from: owner })
    })

    it('create new instance', async () => {
      const signers = [signer1, signer2, signer3]
      const neededSignatures = 2

      await template.newInstance('MultisigDao-' + Math.random() * 1000, signers, neededSignatures)
    })
  })
})
