const encodeCall = require('web3-eth-abi')

const stringifyParams = params => params.map(param => {
  if (Array.isArray(param)) return stringifyParams(param)
  return (typeof(param) === 'boolean') ? param : `${param}`
})

module.exports = (callFn, params, txParams = {}) => {
  const data = encodeCall.encodeFunctionCall(callFn, stringifyParams(params))
  return { ...txParams, data }
}
