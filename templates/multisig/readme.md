# Aragon 0.7 Multisig template

## Usage

```
multisig.newInstance(name, signers, neededSignatures)
```

- `name`: Name for org, will assign `[name].aragonid.eth` (check capitalization)
- `signers`: Array of addresses that are the multisig signatories
  (they will be issued 1 token)
- `neededSignatures`: Number of signers that need to sign to execute an action
  (parametrizing the Voting app under the hood)

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
| Voting            | MODIFY_SUPPORT        | Voting        | Voting  |
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

Tested running `GAS_REPORTER=true truffle test --network devnet test/gas.js`

- Create template:     2842826
- Create new token:    1723050
- Deploy new instance: 5708934
