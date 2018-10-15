require('dotenv').config({ path: './node_modules/@aragon/kits-beta-base/.env'})
const getContract = name => artifacts.require(name)
const getKit = (indexObj, kitName) => getContract(kitName).at(indexObj.networks['devnet'].kits.filter(x => x.name == kitName)[0].address)
const pct16 = x => new web3.BigNumber(x).times(new web3.BigNumber(10).toPower(16))

contract('Multisig Kit', accounts => {
    let kit

    const owner = process.env.OWNER //'0x1f7402f55e142820ea3812106d0657103fc1709e'
    const signer1 = accounts[6]
    const signer2 = accounts[7]
    const signer3 = accounts[8]
    let indexObj = require('../index_local.js')

    context('Use Kit', async () => {
        before(async () => {
            kit = await getKit(indexObj, 'MultisigKit')
        })

        it('create token', async () => {
            await kit.newToken('MultisigToken', 'MST', { from: owner })
        })

        it('create new instance', async () => {
            const signers = [signer1, signer2, signer3]
            const neededSignatures = 2

            await kit.newInstance('MultisigDao-' + Math.random() * 1000, signers, neededSignatures)
        })
    })
})
