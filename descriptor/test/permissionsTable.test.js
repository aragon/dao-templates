const assert = require('assert')
const cli = require('./utils/cli.js')

describe('permissionsTable script', () => {

  it('generates expected output', async () => {
    const result = await cli(
      'permissionsTable.js',
      './examples/company.yaml',
    )
    assert.equal(result.code, 0)
    assert.equal(result.stdout.includes('App | Permission | Grantee | Manager'), true)
    assert.equal(result.stdout.includes('--- | --- | --- | ---'), true)
    assert.equal(result.stdout.includes('kernel|APP_MANAGER_ROLE|share-voting|share-voting'), true)
    assert.equal(result.stdout.includes('acl|CREATE_PERMISSIONS_ROLE|share-voting|share-voting'), true)
    assert.equal(result.stdout.includes('share-voting|CREATE_VOTES_ROLE|share-tm|share-voting'), true)
    assert.equal(result.stdout.includes('share-voting|MODIFY_QUORUM_ROLE|share-voting|share-voting'), true)
    assert.equal(result.stdout.includes('share-voting|MODIFY_SUPPORT_ROLE|share-voting|share-voting'), true)
    assert.equal(result.stdout.includes('agent|EXECUTE_ROLE|share-voting|share-voting'), true)
    assert.equal(result.stdout.includes('agent|RUN_SCRIPT_ROLE|share-voting|share-voting'), true)
    assert.equal(result.stdout.includes('agent|TRANSFER_ROLE|finance|share-voting'), true)
    assert.equal(result.stdout.includes('finance|CREATE_PAYMENTS_ROLE|share-voting|share-voting'), true)
    assert.equal(result.stdout.includes('finance|EXECUTE_PAYMENTS_ROLE|share-voting|share-voting'), true)
    assert.equal(result.stdout.includes('finance|MANAGE_PAYMENTS_ROLE|share-voting|share-voting'), true)
    assert.equal(result.stdout.includes('share-tm|BURN_ROLE|share-voting|share-voting'), true)
    assert.equal(result.stdout.includes('share-tm|MINT_ROLE|share-voting|share-voting'), true)
  })

  it('throws if given no path', async () => {
    const result = await cli(
      'permissionsTable.js',
      '',
    )
    assert.equal(result.code, 1)
  })

  it('throws if given an invalid path', async () => {
    const result = await cli(
      'permissionsTable.js',
      '../non-existing.yaml',
    )
    assert.equal(result.code, 1)
  })
})
