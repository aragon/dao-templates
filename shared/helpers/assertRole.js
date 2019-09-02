const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

module.exports = web3 => {
  async function assertRole(acl, app, manager, roleName, grantee = manager) {
    const appName = app.constructor.contractName
    const permission = await app[roleName]()
    const managerAddress = await acl.getPermissionManager(app.address, permission)

    assert.equal(web3.toChecksumAddress(managerAddress), web3.toChecksumAddress(manager.address), `${appName} ${roleName} Manager should match`)
    assert.isTrue(await acl.hasPermission(grantee.address, app.address, permission), `Grantee should have ${appName} role ${roleName}`)
  }

  async function assertRoleNotGranted(acl, app, roleName, to) {
    const appName = app.constructor.contractName
    const permission = await app[roleName]()

    assert.isFalse(await acl.hasPermission(to.address, app.address, permission), `Given address should not have ${appName} role ${roleName}`)
  }

  async function assertMissingRole(acl, app, roleName) {
    const appName = app.constructor.contractName
    const permission = await app[roleName]()
    const managerAddress = await acl.getPermissionManager(app.address, permission)
    assert.equal(managerAddress, ZERO_ADDRESS, `${appName} ${roleName} does have a manager set up`)
  }

  async function assertBurnedRole(acl, app, roleName) {
    const appName = app.constructor.contractName
    const permission = await app[roleName]()
    const burnEntity = await acl.BURN_ENTITY()
    const managerAddress = await acl.getPermissionManager(app.address, permission)
    assert.equal(managerAddress, burnEntity, `${appName} ${roleName} manager should be burned`)
  }

  return {
    assertRole,
    assertRoleNotGranted,
    assertMissingRole,
    assertBurnedRole
  }
}
