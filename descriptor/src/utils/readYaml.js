const yaml = require('js-yaml')
const fs = require('fs')

const readYaml = (filePath) => {
  const file = fs.readFileSync(filePath, 'utf8')
  return yaml.safeLoad(file)
}

module.exports = readYaml
