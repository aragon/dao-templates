# Aragon Company template

## Usage

Create a new token for the company entity:

```
template.newToken()
```

- `name`: Name for the token used in the organization
- `symbol`: Symbol for the token used in the organization

Create a new company entity:

```
template.newInstance(name, holders, stakes, voteDuration, supportRequired, minAcceptanceQuorum, financePeriod)
```

- `name`: Name for org, will assign `[name].aragonid.eth`
- `holders`: Array of token holder addresses
- `stakes`: Array of token stakes for holders (token has 18 decimals, multiply token amount `* 10^18`)
- `voteDuration`: Time period in which a vote can be resolved
- `supportRequired`: Percentage of total voting power or minimum quorum that a vote needs to be approved/executed
- `minAcceptanceQuorum`: Percentage of the total voting power to consider when calculating support
- `financePeriod`: Initial duration for accounting periods

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
