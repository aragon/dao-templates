const abi = require('web3-eth-abi')

function stringifyParams(params) {
  return params.map(p => {
    if (Array.isArray(p)) {
      return stringifyParams(p)
    }
    else {
      if (typeof(p) === 'boolean') {
        return p
      }
      else {
        return `${p}`
      }
    }
  })
}

function encodeFunctionCall(funcSignature, types, params) {
  params = stringifyParams(params)
  return abi.encodeFunctionSignature(funcSignature) + abi.encodeParameters(types, params).replace('0x', '');
}

module.exports = {
  encodeFunctionCall
}
