/* global web3 */
const fs = require('fs')
const exec = require('child_process').exec
const rl = require('readline').createInterface({
  input: process.stdin,
  output: process.stdout
})
const OpenEnterpriseTemplate = fs.readFileSync('../build/contracts/OpenEnterpriseTemplate.json')

const zeroAddress = '0x00000000000000000000000000000000000000000'
const PCT_BASE = 1e18

let deployedInfo = null

// This function queries APM for the contract address of the Open Enterprise template
// The script will not exit until this address is resolve or the request fails or times out
exec('aragon apm info open-enterprise-template --env production', (err, stdout, stderr) => {
  if (err) {
    console.error(err, ' error getting template address: ', stderr)
    return
  }
  deployedInfo = JSON.parse(getJson(stdout))
})

module.exports = async function getSecondDaoTxData(callback) {
  // This function will generate a data string that the user can send in a tx to our deployments contract
  const oeAbi = JSON.parse(OpenEnterpriseTemplate).abi
  const TemplateContract = web3.eth.contract(oeAbi).at(zeroAddress)
  const voteDuration = await getVoteDuration()
  const minSupport = await getMinSupport()
  const quorum = await getQuorum(minSupport)
  const allocationsPeriod = await getAllocationsPeriod()
  const dataString = TemplateContract.newOpenEnterprise.getData(
    [ minSupport, quorum, voteDuration ],
    allocationsPeriod,
    false
  )
  rl.write('generating information...')
  while (!deployedInfo) {
    await waitASecond()
    rl.write('.')
  }
  rl.write(`\nHere's your data string:\n${dataString}\n\n`)
  rl.write(`submit a transaction with the data string above to ${deployedInfo.contractAddress} in MyCrypto or MEW\n`)

  callback()
}

const waitASecond = () => {
  return new Promise((resolve) => {
    setTimeout(resolve, 1000)
  })
}
const getVoteDuration = () => {
  return new Promise((resolve) => {
    rl.question('enter the desired dot voting period length, in seconds > ', async (answer) => {
      if (answer <= 0) {
        rl.write('Error: Vote Duration must be greater than zero\n')
        resolve(await getVoteDuration())
      }
      resolve(answer)
    })
  })
}

const getMinSupport = () => {
  return new Promise((resolve) => {
    rl.question('enter the dot voting minimum candidate support percentage > ', async (answer) => {
      if ((answer * 1e16) > PCT_BASE) {
        rl.write('Error: Minimum Support Percentage must be less than 100%\n')
        resolve(await getMinSupport())
      } else if (answer <= 0) {
        rl.write('Error: Minimum Support Percentage must be greater than zero\n')
        resolve(await getMinSupport())
      }
      resolve(answer * 1e16)
    })
  })
}

const getQuorum = (minSupport) => {
  return new Promise((resolve) => {
    rl.question('enter the dot voting quorum percentage > ', async (answer) => {
      if ((answer * 1e16) < minSupport) {
        rl.write('Error: Quorum must be greater than or equal to minimum candidate support percentage\n')
        resolve(await getQuorum(minSupport))
      } else if ((answer * 1e16) > PCT_BASE) {
        rl.write('Error: Quorum must be less than 100%\n')
        resolve(await getQuorum(minSupport))
      }
      resolve(answer * 1e16)
    })
  })
}

const getAllocationsPeriod = () => {
  return new Promise((resolve) => {
    rl.question('enter the allocations period duration, in days > ', async (answer) => {
      if (answer <= 0) {
        rl.write('Error: Allocations budgeting period must be greater than zero\n')
        resolve(await getAllocationsPeriod())
      }
      resolve(answer * 24 * 60 * 60)
    })
  })
}

const getJson = (rawOutput) => {
  // This helper function cleans up the string returned from the APM query
  // and makes it convertible into JSON
  const sanitizedOutput = rawOutput.replace(/\n/g, '')
  const startIdx = sanitizedOutput.indexOf('{')
  return sanitizedOutput.substring(startIdx)
}
