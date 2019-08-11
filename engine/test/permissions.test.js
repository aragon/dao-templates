const cli = require('./utils/cli.js');

contract('permissions command', () => {

  it('Generates expected output', async () => {
    const result = await cli(
      'permissions',
      './descriptors/company.yaml',
    )
    assert.equal(result.code, 0)
    assert.include(result.stdout, 'App | Permission | Grantee | Manager')
    assert.include(result.stdout, '--- | --- | --- | ---')
    assert.include(result.stdout, 'kernel|APP_MANAGER_ROLE|share-voting|share-voting')
    assert.include(result.stdout, 'acl|CREATE_PERMISSIONS_ROLE|share-voting|share-voting')
    assert.include(result.stdout, 'share-voting|CREATE_VOTES_ROLE|share-tm|share-voting')
    assert.include(result.stdout, 'share-voting|MODIFY_QUORUM_ROLE|share-voting|share-voting')
    assert.include(result.stdout, 'share-voting|MODIFY_SUPPORT_ROLE|share-voting|share-voting')
    assert.include(result.stdout, 'agent|EXECUTE_ROLE|share-voting|share-voting')
    assert.include(result.stdout, 'agent|RUN_SCRIPT_ROLE|share-voting|share-voting')
    assert.include(result.stdout, 'agent|TRANSFER_ROLE|finance|share-voting')
    assert.include(result.stdout, 'finance|CREATE_PAYMENTS_ROLE|share-voting|share-voting')
    assert.include(result.stdout, 'finance|EXECUTE_PAYMENTS_ROLE|share-voting|share-voting')
    assert.include(result.stdout, 'finance|MANAGE_PAYMENTS_ROLE|share-voting|share-voting')
    assert.include(result.stdout, 'share-tm|BURN_ROLE|share-voting|share-voting')
    assert.include(result.stdout, 'share-tm|MINT_ROLE|share-voting|share-voting')
  })
})
