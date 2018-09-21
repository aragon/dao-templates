const abis = {
  MultisigKit: require('../build/contracts/MultisigKit').abi,
}

require('fs').writeFileSync('abis.json', JSON.stringify(abis, null, 2))
console.log('generated and saved abis.json')
