const readYaml = require('../utils/readYaml')

const signature = 'permissions <descriptorFilePath>';
const description = 'Generates a markdown table listing the permissions of a DAO'
const help = `
Generates a markdown table listing the permissions of a DAO, given a DAO template descriptor file.

Eg.

> dao-template-engine permissions ./descriptors/company.yaml
App | Permission | Grantee | Manager
--- | --- | --- | ---
kernel|APP_MANAGER_ROLE|share-voting|share-voting
acl|CREATE_PERMISSIONS_ROLE|share-voting|share-voting
share-voting|CREATE_VOTES_ROLE|share-tm|share-voting
share-voting|MODIFY_QUORUM_ROLE|share-voting|share-voting
share-voting|MODIFY_SUPPORT_ROLE|share-voting|share-voting
agent|EXECUTE_ROLE|share-voting|share-voting
agent|RUN_SCRIPT_ROLE|share-voting|share-voting
agent|TRANSFER_ROLE|finance|share-voting
finance|CREATE_PAYMENTS_ROLE|share-voting|share-voting
finance|EXECUTE_PAYMENTS_ROLE|share-voting|share-voting
finance|MANAGE_PAYMENTS_ROLE|share-voting|share-voting
share-tm|BURN_ROLE|share-voting|share-voting
share-tm|MINT_ROLE|share-voting|share-voting
`

module.exports = {
  signature,
  description,
  register: (program) => {
    program
      .command(signature, {noHelp: true})
      .description(description)
      .on('--help', () => console.log(help))
      .action((descriptorFilePath) => {

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
      })
  }
}
