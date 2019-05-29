module.exports = web3 => {
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

  async function transactionWillRevert(tx) {
    try {
      await web3.eth.estimateGas(tx)
      return false
    } catch (error) {
      return true
    }
  }

  return async function (request, reason) {
    const tx = request.params[0]
    assert.isTrue(await transactionWillRevert(tx), 'Transaction should revert')

    if (reason.lentgh === 0) return true
    const response = await web3.eth.call(tx)
    const reasonFound = decodeReason(response)
    assert.equal(reasonFound, reason, `Revert reason '${reason}' not found. Found '${reasonFound}' instead.` )
  }
}
