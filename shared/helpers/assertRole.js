module.exports = web3 => async (acl, app, manager, appName, roleName, grantee = manager) => {
  const permission = await app[roleName]()
  const managerAddress = await acl.getPermissionManager(app.address, permission)

  assert.equal(web3.toChecksumAddress(managerAddress), web3.toChecksumAddress(manager.address), `${appName} ${roleName} Manager should match`)
  assert.isTrue(await acl.hasPermission(grantee.address, app.address, permission), `Grantee should have ${appName} role ${roleName}`)
}
