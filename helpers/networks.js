const getNetworkNameFromId = (networks, id) => {
  const defaultNetwork = 'devnet'
  for (let n in networks) {
    if (networks[n].network_id == id) {
      return n
    }
  }
  return defaultNetwork
}
const getNetworkId = () =>
  new Promise(
    (resolve, reject) =>
      web3.version.getNetwork(
        (error, result) => error ? reject(error) : resolve(result)
      )
  )

module.exports = async (networks) => {
  const id = await getNetworkId()
  const name = getNetworkNameFromId(networks, id)
  return { id, name }
}
