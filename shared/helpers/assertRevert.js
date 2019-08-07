module.exports = web3 => {
  const { isGanache } = require('./node')(web3)

  function decodeReason(returnValue) {
    if (returnValue.substring(0, 2) === '0x') returnValue = returnValue.slice(2)

    const rawReason = returnValue
      .slice(8)   // remove identifier: bytes4(keccak256('Error(string)'))
      .slice(128) // remove encoded result metadata (length + offset)

    let decodedReason = ''
    for (let i = 0; i < rawReason.length; i += 2) {
      const code = parseInt(rawReason.substr(i, 2), 16)
      if (code === 0) continue
      decodedReason += String.fromCharCode(code)
    }

    return decodedReason
  }

  async function assertRevertGeth(request, reason) {
    try {
      await request
    } catch (error) {
      const { tx, receipt: { status } } = error
      assert.equal(status, '0x0', `Expected transaction to revert but it executed with status ${status}`)
      if (reason.length === 0) return true

      assert.notEqual(tx, undefined, `Expected error to include transaction hash, cannot assert revert reason ${reason}: ${error}`)
      const { gas, gasPrice, from, to, nonce, input: data } = web3.eth.getTransaction(tx)
      const response = await web3.eth.call({ data, from, to, gas, gasPrice, nonce })
      const reasonFound = decodeReason(response)
      assert.equal(reasonFound, reason, `Revert reason '${reason}' not found. Found '${reasonFound}' instead.` )
    }
  }

  async function assertRevertGanache(request, reason) {
    const { assertRevert } = require('@aragon/test-helpers/assertThrow')
    return assertRevert(request, reason)
  }

  return isGanache() ? assertRevertGanache : assertRevertGeth
}
