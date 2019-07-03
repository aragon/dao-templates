require('dotenv').config()
const namehash = require('eth-ens-namehash').hash

const deployDAOFactory = require('@aragon/os/scripts/deploy-daofactory.js')


const apps = ['agent', 'finance', 'token-manager', 'vault', 'voting']
const appIds = apps.map(app => namehash(require(`@aragon/apps-${app}/arapp`).environments.default.appName))

const getContract = name => artifacts.require(name)
const getEventResult = (receipt, event, param) => receipt.logs.filter(l => l.event == event)[0].args[param]
const getAppProxy = (receipt, id) => receipt.logs.filter(l => l.event == 'InstalledApp' && l.args.appId == id)[0].args.appProxy

contract('Beta Base Kit', accounts => {
    let beta, tokenAddress, daoAddress
    let financeAddress, tokenManagerAddress, vaultAddress, votingAddress
    const owner = process.env.OWNER //'0x1f7402f55e142820ea3812106d0657103fc1709e'
    const arappObj = require('../arapp_local')
    const network = 'devnet' // TODO
    const ensAddress = process.env.ENS || arappObj.environments[network].registry

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
        daoAddress = getEventResult(daoReceipt, 'DeployInstance', 'dao')
        const tokenAddr = getEventResult(daoReceipt, 'DeployInstance', 'token')
        // generated Voting app
        financeAddress = getAppProxy(daoReceipt, appIds[1])
        tokenManagerAddress = getAppProxy(daoReceipt, appIds[2])
        vaultAddress = getAppProxy(daoReceipt, appIds[3])
        votingAddress = getAppProxy(daoReceipt, appIds[4])

        assert.notEqual(daoAddress, '0x0', 'DAO not generated')
        assert.equal(tokenAddr, tokenAddress, 'Token address should match')
        assert.notEqual(financeAddress, '0x0', 'Finance not generated')
        assert.notEqual(tokenManagerAddress, '0x0', 'Token Manager not generated')
        assert.notEqual(vaultAddress, '0x0', 'Vault not generated')
        assert.notEqual(votingAddress, '0x0', 'Voting not generated')
    })

    it('has correct permissions', async () =>{
        const dao = await getContract('Kernel').at(daoAddress)
        const acl = await getContract('ACL').at(await dao.acl())

        const checkRole = async (appAddress, permission, managerAddress, appName='', roleName='', granteeAddress=managerAddress) => {
            assert.equal(await acl.getPermissionManager(appAddress, permission), managerAddress, `${appName} ${roleName} Manager should match`)
            assert.isTrue(await acl.hasPermission(granteeAddress, appAddress, permission), `Grantee should have ${appName} role ${roleName}`)
        }

        // app manager role
        assert.equal(await acl.getPermissionManager(daoAddress, (await dao.APP_MANAGER_ROLE())), votingAddress, 'App manager role manager should match')

        // evm script registry
        const regConstants = await getContract('EVMScriptRegistryConstants').new()
        const reg = await getContract('EVMScriptRegistry').at(await acl.getEVMScriptRegistry())
        assert.equal(await acl.getPermissionManager(reg.address, (await reg.REGISTRY_ADD_EXECUTOR_ROLE())), votingAddress, 'Registry add executor role manager should match')
        assert.equal(await acl.getPermissionManager(reg.address, (await reg.REGISTRY_MANAGER_ROLE())), votingAddress, 'Registry Manager role manager should match')

        // voting
        const voting = await getContract('Voting').at(votingAddress)
        await checkRole(votingAddress, await voting.CREATE_VOTES_ROLE(), votingAddress, 'Voting', 'CREATE_VOTES', tokenManagerAddress)
        assert.equal(await acl.getPermissionManager(votingAddress, (await voting.MODIFY_QUORUM_ROLE())), votingAddress, 'Voting Modify quorum role manager should match')

        // vault
        const vault = await getContract('Vault').at(vaultAddress)
        await checkRole(vaultAddress, await vault.TRANSFER_ROLE(), votingAddress, 'Vault', 'TRANSFER', financeAddress)

        // finance
        const finance = await getContract('Finance').at(financeAddress)
        assert.equal(await acl.getPermissionManager(financeAddress, (await finance.CREATE_PAYMENTS_ROLE())), votingAddress, 'Finance Create Payments role manager should match')
        assert.equal(await acl.getPermissionManager(financeAddress, (await finance.EXECUTE_PAYMENTS_ROLE())), votingAddress, 'Finance Execute Payments role manager should match')
        assert.equal(await acl.getPermissionManager(financeAddress, (await finance.MANAGE_PAYMENTS_ROLE())), votingAddress, 'Finance Manage Payments role manager should match')

        // token manager
        const tokenManager = await getContract('TokenManager').at(tokenManagerAddress)
        assert.equal(await acl.getPermissionManager(tokenManagerAddress, (await tokenManager.ASSIGN_ROLE())), votingAddress, 'Token Manager Assign role manager should match')
        assert.equal(await acl.getPermissionManager(tokenManagerAddress, (await tokenManager.REVOKE_VESTINGS_ROLE())), votingAddress, 'Token Manager Revoke vestings role manager should match')

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
