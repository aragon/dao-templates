const abi = require('web3-eth-abi')

abiUtil = {

  stringifyParams: (params) => {
    return params.map(p => {
      if (Array.isArray(p)) {
        return abiUtil.stringifyParams(p)
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
  },

  encodeFunctionCall: (funcSignature, types, params) => {
    params = abiUtil.stringifyParams(params)
    return abi.encodeFunctionSignature(funcSignature) + abi.encodeParameters(types, params).replace('0x', '');
  }
}

module.exports = abiUtil
