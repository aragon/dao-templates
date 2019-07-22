# Aragon 0.7 Democracy template

## Usage

Create a new democracy MiniMe token:

```
template.newToken(name, symbol)
```

- `name`: Token name of the MiniMe token to be deployed for the democracy entity
- `symbol`: Token symbol of the MiniMe token to be deployed for the democracy entity

Create a new democracy entity:

```
template.newInstance(name, holders, stakes, support, acceptance, voteDuration)
```

- `name`: Name for org, will assign `[name].aragonid.eth` (check capitalization)
- `holders`: Array of token holder addresses
- `stakes`: Array of token stakes for holders (token has 18 decimals, multiply token amount `* 10^18`)
- `support`, `acceptance`, and `voteDuration`: Check [Voting app spec](https://wiki.aragon.org/dev/apps/voting/)

## Deploying templates

After deploying ENS, APM and AragonID, just run:

```
npm run deploy:rinkeby
```

The network details will be automatically selected by the `arapp.json`'s environments.

## Permissions

| App               | Permission            | Grantee       | Manager |
|-------------------|-----------------------|---------------|---------|
| Voting            | CREATE_VOTES          | Token Manager | Voting  |
| Voting            | MODIFY_QUORUM         | Voting        | Voting  |
| Voting            | MODIFY_SUPPORT        | None          | Burned  |
| Vault             | TRANSFER              | Finance       | Voting  |
| Finance           | CREATE_PAYMENTS       | Voting        | Voting  |
| Finance           | EXECUTE_PAYMENTS      | Voting        | Voting  |
| Finance           | DISABLE_PAYMENTS      | Voting        | Voting  |
| Token Manager     | ASSIGN                | Voting        | Voting  |
| Token Manager     | REVOKE_VESTINGS       | Voting        | Voting  |
| Kernel            | APP_MANAGER           | Voting        | Voting  |
| ACL               | CREATE_PERMISSIONS    | Voting        | Voting  |
| EVMScriptRegistry | REGISTRY_ADD_EXECUTOR | Voting        | Voting  |
| EVMScriptRegistry | REGISTRY_MANAGER      | Voting        | Voting  |

## Gas usage

Tested running `GAS_REPORTER=true truffle test --network devnet test/gas.js`, plus `deploy.js` script.

- Create template:     2816197
- Create new token:    1738117
- Deploy new instance: 5690035
