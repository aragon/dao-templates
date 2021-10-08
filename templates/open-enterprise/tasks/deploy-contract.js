const { task } = require( 'hardhat/config' )

const TASK_GET_CONSTRUCTOR_ARGS = 'verify:get-constructor-arguments'
const TASK_DEPLOY_CONTRACT = 'deploy-contract'
const TASK_COMPILE = 'compile'

task(TASK_DEPLOY_CONTRACT, 'Deploy a contract')
  .addParam(
    'contract',
    'Contract name or fully qualified name, contract/Projects.sol:Projects',
    undefined,
    types.string
  )
  .addOptionalParam(
    "constructorArgsPath",
    "File path to a javascript module that exports the list of arguments.",
    undefined,
    types.inputFile
  )
  .addOptionalVariadicPositionalParam(
    "constructorArgsParams",
    "Contract constructor arguments. Ignored if the --constructor-args-path option is used.",
    []
  )
  .setAction(async (args, hre) => {
    console.log('compiling contracts...')
    await hre.run(TASK_COMPILE)

    const {constructorArgsPath: constructorArgsModule, constructorArgsParams} = args
    const constructorArgs = await run(TASK_GET_CONSTRUCTOR_ARGS, {
      constructorArgsModule,
      constructorArgsParams,
    })

    console.log('creating contract...')
    const factory = await hre.ethers.getContractFactory(args.contract)
    const deployment = await factory.deploy(...constructorArgs)
    const contractAddress = deployment.address
    await deployment.deployTransaction.wait()
    console.log('new contract address', contractAddress)
    return contractAddress
  })

