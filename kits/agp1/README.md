# AGP-1 Kit
See [AGP1](https://github.com/aragon/AGPs/pull/1) and [discussion](https://forum.aragon.org/t/request-for-comment-agp-1-the-aragon-governance-proposal-process) for the governance structure that this kit creates.

## Using the Kit

### Dependencies
In order to use this kit, it must be run on a chain that has the following dependencies published.
- ENS
- APM
- A MiniMeToken (`ANT` for mainnet)
- `finance.aragonpm.eth`
- `vault.aragonpm.eth`
- `voting.aragonpm.eth`

For local chains you can use `deploy:deps` scripts to deploy everything needed.

### Deploying the kit
Local development network:
```
npm run deploy:rpc
```
and:
```
npm run test:rpc
```

Rinkeby:
```
npm run deploy:rinkeby
```

## Permissions

| App               | Permission         | Grantee           | Manager           |
|-------------------|--------------------|-------------------|-------------------|
| Main Voting       | CREATE_VOTES       | Multisig          | Multisig          |
| Main Voting       | MODIFY_QUORUM      | Meta Track Voting | Meta Track Voting |
| Main Voting       | MODIFY_SUPPORT     | Meta Track Voting | Meta Track Voting |
| Meta Track Voting | CREATE_VOTES       | Multisig          | Multisig          |
| Meta Track Voting | MODIFY_QUORUM      | Meta Track Voting | Meta Track Voting |
| Meta Track Voting | MODIFY_SUPPORT     | Meta Track Voting | Meta Track Voting |
| Vault             | TRANSFER           | Finance           | Meta Track Voting |
| Finance           | CREATE_PAYMENTS    | Main Voting       | Meta Track Voting |
| Finance           | EXECUTE_PAYMENTS   | Main Voting       | Meta Track Voting |
| Finance           | MANAGE_PAYMENTS    | Main Voting       | Meta Track Voting |
| Kernel            | APP_MANAGER        | Meta Track Voting | Meta Track Voting |
| ACL               | CREATE_PERMISSIONS | Meta Track Voting | Meta Track Voting |
|                   |                    |                   |                   |
