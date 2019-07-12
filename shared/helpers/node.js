const GANACHE_NODE_ID = 'TestRPC'

module.exports = web3 => ({
  isGanache() {
    return web3.version.node.includes(GANACHE_NODE_ID)
  }
})
