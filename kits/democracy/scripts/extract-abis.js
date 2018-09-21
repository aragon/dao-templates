const abis = {
  DemocracyKit: require('../build/contracts/DemocracyKit').abi,
}

require('fs').writeFileSync('abis.json', JSON.stringify(abis, null, 2))
console.log('generated and saved abis.json')
