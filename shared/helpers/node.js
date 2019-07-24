const GETH_NODE_ID = 'Geth'
const GANACHE_NODE_ID = 'TestRPC'

module.exports = web3 => ({
  isGeth() {
    return web3.version.node.includes(GETH_NODE_ID)
  },

  isGanache() {
    return web3.version.node.includes(GANACHE_NODE_ID)
  }
})
