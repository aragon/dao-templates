const fs = require('fs')

const ensAddress = process.env.ENS
const network = 'devnet'
const indexFileName = 'index_local.js'

let indexObj = require('../' + indexFileName)

indexObj.networks[network].ens = ensAddress

const indexFile = 'module.exports = ' + JSON.stringify(indexObj, null, 2)
fs.writeFileSync(indexFileName, indexFile)
console.log('ENS saved to ' + indexFileName)
