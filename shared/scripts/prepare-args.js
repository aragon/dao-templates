'use strict';

const fs = require('fs')
const path = require('path')

const logError = (message) => console.error("\x1b[31m", message)
const isOpenEnterpriseApp = appName => appName === "open-enterprise"

if( process.argv.length < 5){
  logError("Usage: node ./generate-args <network> <appName> <outputDir>")
  process.exit(-1)
}

const network = process.argv[2]
const appName = process.argv[3]
const outDir = process.argv[4]

if( !network ) {
  logError('network is required')
  process.exit(-1)
}

const args = require(`../constructor-args/${network}.js`)
const argsArray = [
  args["daoFactory"],
  args["ensRegistry"],
  args["minimeFactory"],
  args["aragonID"]
]

if( isOpenEnterpriseApp(appName) ) {
  argsArray.push(args["standardBounties"])
}

const content = "module.exports = " + JSON.stringify(isOpenEnterpriseApp(appName)? [argsArray]: argsArray, null, 2)
const outputPath = path.resolve(outDir, `${network}-${appName}.js`)
fs.writeFileSync(outputPath, content, { flag: 'w+' });

