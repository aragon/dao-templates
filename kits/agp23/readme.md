# AGP23 Kit

See [AGP23](https://github.com/aragon/governance/issues/32) for the governance structure that this kit creates.

## Using the Kit

### Dependencies

In order to use this kit, it must be run on a chain that has the following dependencies published in APM.

- `bare-kit.aragonpm.eth`
- `voting.aragonpm.eth`
- `token-manager.aragonpm.eth`
- `vault.aragonpm.eth`
- `voting-daemon.aragonpm.eth`

### Deploying the kit

Local development network:
```
npm run publish:rpc
```

Rinkeby:
```
npm run publish:rinkeby
```

### Deploying a test DAO

```
dao new --kit agp23-kit --fn newTestInstance --network rpc
```

## Permissions

| App           | Permission         | Grantee        | Manager     |
|---------------|--------------------|----------------|-------------|
| Main Voting   | CREATE_VOTES       | 2 voters       | Main Voting |
| Veto Voting   | CREATE_VOTES       | Voting Daemon  | Main Voting |
| Vault         | TRANSFER           | Main Voting    | Main Voting |
| Vault         | TRANSFER           | Voting Daemon  | Main Voting |
| Token Manager | MINT_ROLE          | None           | Burned      |
| Kernel        | APP_MANAGER        | Main Voting    | Main Voting |
| ACL           | CREATE_PERMISSIONS | Main Voting    | Main Voting |