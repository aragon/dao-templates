const { task } = require( 'hardhat/config' )

const TASK_DEPLOY_CONTRACT = "deploy-contract"
const TASK_COMPILE = "compile"

task(TASK_DEPLOY_CONTRACT, 'Deploy a contract')
  .addParam(
    'contract',
    'Contract name or fully qualified name, contract/Projects.sol:Projects',
    undefined,
    types.string
  )
  .addOptionalVariadicPositionalParam(
    'constructorArgs',
    'Constructor arguments for the contract.',
    []
  )
  .setAction(async (args, hre) => {
    console.log('compiling contracts...')
    await hre.run(TASK_COMPILE)

    console.log('creating contract...')
    const factory = await hre.ethers.getContractFactory(args.contract)
    const deployment = await factory.deploy(...args.constructorArgs)
    const contractAddress = deployment.address
    await deployment.deployTransaction.wait()
    console.log('new contract address', contractAddress)
  })
