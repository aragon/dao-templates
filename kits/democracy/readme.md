# Aragon 0.5 Democracy template

See [Beta templates description](https://github.com/aragon/dao-kits/blob/master/kits/beta-base/readme.md).

## Usage

```
democracy.newInstance(name, holders, stakes, supportNeeded, minAcceptanceQuorum, voteDuration)
```

- `name`: Name for org, will assign `[name].aragonid.eth` (check capitalization)
- `holders`: Array of token holder addresses
- `stakes`: Array of token stakes for holders (token has 18 decimals, multiply token amount `* 10^18`)
- `supportNeeded, minAcceptanceQuorum, voteDuration`: Check [Voting app spec](https://wiki.aragon.one/dev/apps/voting/)

## Deploying templates

After deploying ENS, APM and AragonID. Change `index.js` ENS address for the
deployment network.

Then just:

```
npm run deploy:rinkeby
```

## Permissions

| App               | Permission            | Grantee | Manager |
|-------------------|-----------------------|---------|---------|
| Voting            | CREATE_VOTES          | Any     | Voting  |
| Voting            | MODIFY_QUORUM         | Voting  | Voting  |
| Voting            | MODIFY_SUPPORT        | None    | Burned  |
| Vault             | TRANSFER              | Finance | Voting  |
| Finance           | CREATE_PAYMENTS       | Voting  | Voting  |
| Finance           | EXECUTE_PAYMENTS      | Voting  | Voting  |
| Finance           | DISABLE_PAYMENTS      | Voting  | Voting  |
| Token Manager     | ASSIGN                | Voting  | Voting  |
| Token Manager     | REVOKE_VESTINGS       | Voting  | Voting  |
| Kernel            | APP_MANAGER           | Voting  | Voting  |
| ACL               | CREATE_PERMISSIONS    | Voting  | Voting  |
| EVMScriptRegistry | REGISTRY_ADD_EXECUTOR | Voting  | Voting  |
| EVMScriptRegistry | REGISTRY_MANAGER      | Voting  | Voting  |

## Gas usage

Tested running `GAS_REPORTER=true truffle test --network devnet test/gas.js`, plus `deploy-kit.js` script in `beta-base`.

- Create the Kit:      2816197
- Create new token:    1738117
- Deploy new instance: 5690035
