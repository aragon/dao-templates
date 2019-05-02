module.exports = {
  depositerABI: [{"constant":false,"inputs":[{"name":"finance","type":"address"},{"name":"token","type":"address"},{"name":"many","type":"uint256"},{"name":"why","type":"string"}],"name":"pleaseAirdrop","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"inputs":[{"name":"_factory","type":"address"}],"payable":false,"stateMutability":"nonpayable","type":"constructor"}],
  rinkeby: {
    factory: '0xff4E0FE747f999a07AB03eBf3c8B3B5232Ef2350',
    depositer: '0x39a4d265db942361d92e2b0039cae73ea72a2ff9',
    tokens: [
      '0x0d5263b7969144a852d58505602f630f9b20239d',
      '0x6142214d83670226872d51e935fb57bec8832a60',
      '0x1e1cab55639f67e70973586527ec1dfdaf9bf764',
      '0x5e381afb0104d374f1f3ccde5ba7fe8f5b8af0e6',
      '0xa53899a7eb70b309f05f8fdb344cdc8c8f272abe',
      '0x5b2fdbba47e8ae35b9d6f8e1480703334f48b96c',
      '0x51e53b52555a4ab7227423a7761cc8e418b147c8',
      '0xc42da14b1c0ae7d4dd3946633f1046c3d46f3101',
      '0x4fc6e3b791560f25ed4c1bf5e2db9ab0d0e80747',
      '0x0527e400502d0cb4f214dd0d2f2a323fc88ff924'
    ]
  }
}
