const namehash = require('eth-ens-namehash').hash

const deploy_ens = require('@aragon/os/scripts/deploy-beta-ens.js')
const deploy_apm = require('@aragon/os/scripts/deploy-beta-apm.js')
const deploy_id = require('@aragon/id/scripts/deploy-beta-aragonid.js')
const deployDAOFactory = require('@aragon/os/scripts/deploy-daofactory.js')

// ensure alphabetic order
const apps = ['finance', 'token-manager', 'vault', 'voting']
const appIds = apps.map(app => namehash(require(`@aragon/apps-${app}/arapp`).appName))

const getContract = name => artifacts.require(name)
const getKit = (indexObj, kitName) => getContract(kitName).at(indexObj.networks['devnet'].kits.filter(x => x.name == kitName)[0].address)
const pct16 = x => new web3.BigNumber(x).times(new web3.BigNumber(10).toPower(16))
const getEventResult = (receipt, event, param) => receipt.logs.filter(l => l.event == event)[0].args[param]


contract('Democracy Kit', accounts => {
    let kit

    const owner = process.env.OWNER //'0x1f7402f55e142820ea3812106d0657103fc1709e'
    const holder20 = accounts[6]
    const holder29 = accounts[7]
    const holder51 = accounts[8]
    let indexObj = require('../index_local.js')

    const neededSupport = pct16(50)
    const minimumAcceptanceQuorum = pct16(20)
    const votingTime = 10

    context('Use Kit', async () => {
        before(async () => {
            kit = await getKit(indexObj, 'DemocracyKit')
        })

        it('create token', async () => {
            await kit.newToken('DemocracyToken', 'DTT', { from: owner })
        })

        it('create new instance', async () => {
            const holders = [holder20, holder29, holder51]
            const stakes = [20e18, 29e18, 51e18]

            await kit.newInstance('DemocracyDao-' + Math.random() * 1000, holders, stakes, neededSupport, minimumAcceptanceQuorum, votingTime, { from: owner })
        })
    })
})
