const readYaml = require('../utils/readYaml')

const args = process.argv.slice(2)
const descriptorFilePath = args[0]

const yaml = readYaml(descriptorFilePath)

let str = 'App | Permission | Grantee | Manager\n'
str += '--- | --- | --- | ---\n'
yaml.permissions.forEach((permission) => {
  const app = permission.app || '?'
  const role = permission.role || '?'
  const grantee = permission.grantee || '?'
  const manager = permission.manager || '?'
  str += `${app}|${role}|${grantee}|${manager}\n`
})

console.log(str)
