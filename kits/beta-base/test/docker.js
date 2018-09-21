const namehash = require('eth-ens-namehash').hash

const deployDAOFactory = require('@aragon/os/scripts/deploy-daofactory.js')


const apps = ['finance', 'token-manager', 'vault', 'voting']
const appIds = apps.map(app => namehash(require(`@aragon/apps-${app}/arapp`).appName))

const getContract = name => artifacts.require(name)
const getEventResult = (receipt, event, param) => receipt.logs.filter(l => l.event == event)[0].args[param]
const getAppProxy = (receipt, id) => receipt.logs.filter(l => l.event == 'InstalledApp' && l.args.appId == id)[0].args.appProxy

contract('Beta Base Kit', accounts => {
    let beta, tokenAddress
    const owner = process.env.OWNER //'0x1f7402f55e142820ea3812106d0657103fc1709e'
    const indexObj = require('../index_local.js')
    const network = 'devnet' // TODO
    const ensAddress = process.env.ENS || indexObj.networks[network].ens

    before(async () => {
        const minimeFac = await getContract('MiniMeTokenFactory').new()
        const ens = getContract('ENS').at(ensAddress)
        const aragonId = await ens.owner(namehash('aragonid.eth'))
        const { daoFactory } = await deployDAOFactory(null, { artifacts, verbose: false })

        // Beta base kit
        beta = await getContract('BetaKitBaseMock').new(daoFactory.address, ensAddress, minimeFac.address, aragonId, appIds)

        // Token
        const tokenReceipt = await beta.newToken('test', 'TST')
        tokenAddress = getEventResult(tokenReceipt, 'CreateToken', 'token')
    })

    it('creates DAO', async() => {
        const daoReceipt = await beta.createDaoExt('Test-' + Math.random() * 1000, tokenAddress, [owner], [1], 1)
        const daoAddress = getEventResult(daoReceipt, 'DeployInstance', 'dao')
        const tokenAddr = getEventResult(daoReceipt, 'DeployInstance', 'token')
        // generated Voting app
        const financeAddress = getAppProxy(daoReceipt, appIds[0])
        const tokenManagerAddress = getAppProxy(daoReceipt, appIds[1])
        const vaultAddress = getAppProxy(daoReceipt, appIds[2])
        const votingAddress = getAppProxy(daoReceipt, appIds[3])

        assert.notEqual(daoAddress, '0x0', 'DAO not generated')
        assert.equal(tokenAddr, tokenAddress, 'Token address should match')
        assert.notEqual(financeAddress, '0x0', 'Finance not generated')
        assert.notEqual(tokenManagerAddress, '0x0', 'Token Manager not generated')
        assert.notEqual(vaultAddress, '0x0', 'Vault not generated')
        assert.notEqual(votingAddress, '0x0', 'Voting not generated')
    })

    it('caches token and pops cached token', async  () => {
        //caches
        const r1 = await beta.cacheTokenExt(tokenAddress, owner)
        const token1 = getEventResult(r1, 'DeployToken', 'token')
        assert.equal(token1, tokenAddress, "Cached token address should match")

        //pops
        const r2 = await beta.popTokenCacheExt(owner);
        const token2 = getEventResult(r2, 'PopToken', 'token')
        assert.equal(token2, tokenAddress, "Popped token address should match")
    })
})
