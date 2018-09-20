const abis = {
  DemocracyTemplate: require('../build/contracts/DemocracyTemplate').abi,
}

require('fs').writeFileSync('abis.json', JSON.stringify(abis, null, 2))
console.log('generated and saved abis.json')
