const getContract = name => artifacts.require(name)
const getTemplate = (arappObj, contractName) => getContract(contractName).at(arappObj.environments['devnet'].address)

// `npm run test` needs to be run first so arapp_local.json gets created
// then you can run it with `truffle test --network devnet test/gas.js`
// having a docker geth image running (`npm run docker:run && npm run docker:wait-gas`)
contract('Multisig Template', accounts => {
    let template

    const owner = accounts[0]
    const signer1 = accounts[6]
    const signer2 = accounts[7]
    const signer3 = accounts[8]
    let arappObj = require('../arapp_local.json')

    context('Use Template', async () => {
        before(async () => {
            template = await getTemplate(arappObj, 'MultisigTemplate')
        })

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
