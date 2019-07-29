# Aragon Membership template

## Usage

Create a new token for the membership entity:

```
template.newToken(name, symbol)
```

- `name`: Name for the token used in the organization
- `symbol`: Symbol for the token used in the organization

Create a new membership entity:

```
template.newInstance(name, members, voteSettings, financePeriod, useAgentAsVault)
```

- `name`: Name for org, will assign `[name].aragonid.eth`
- `members`: Array of member addresses (1 token will be minted for each member)
- `voteSettings`: Array of [supportRequired, minAcceptanceQuorum, voteDuration] for votes by the organization's members
- `financePeriod`: Initial duration for accounting periods
- `useAgentAsVault`: Use an Agent app as a more advanced form of Vault app

## Deploying templates

After deploying ENS, APM and AragonID, just run:

```
npm run deploy:rinkeby
```

The network details will be automatically selected by the `arapp.json`'s environments.

## Permissions

| App               | Permission            | Grantee       | Manager |
|-------------------|-----------------------|---------------|---------|
| Kernel            | APP_MANAGER           | Voting        | Voting  |
| ACL               | CREATE_PERMISSIONS    | Voting        | Voting  |
| EVMScriptRegistry | REGISTRY_MANAGER      | Voting        | Voting  |
| EVMScriptRegistry | REGISTRY_ADD_EXECUTOR | Voting        | Voting  |
| Voting            | CREATE_VOTES          | Token Manager | Voting  |
| Voting            | MODIFY_QUORUM         | Voting        | Voting  |
| Voting            | MODIFY_SUPPORT        | Voting        | Voting  |
| Agent             | TRANSFER              | Finance       | Voting  |
| Agent             | RUN_SCRIPT            | Voting        | Voting  |
| Agent             | EXECUTE               | Voting        | Voting  |
| Finance           | CREATE_PAYMENTS       | Voting        | Voting  |
| Finance           | EXECUTE_PAYMENTS      | Voting        | Voting  |
| Finance           | DISABLE_PAYMENTS      | Voting        | Voting  |
| Token Manager     | MINT                  | Voting        | Voting  |
| Token Manager     | BURN                  | Voting        | Voting  |
