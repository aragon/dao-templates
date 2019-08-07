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
template.newInstance(name, members, votingSettings, financePeriod, useAgentAsVault)
```

- `name`: Name for org, will assign `[name].aragonid.eth`
- `members`: Array of member addresses (1 token will be minted for each member)
- `votingSettings`: Array of [supportRequired, minAcceptanceQuorum, voteDuration] to set up the voting app of the organization
- `financePeriod`: Initial duration for accounting periods, it can be set to zero in order to use the default of 30 days.
- `useAgentAsVault`: Use an Agent app as a more advanced form of Vault app

Alternatively, create a new membership entity with a Payroll app:

```
template.newInstance(name, members, votingSettings, financePeriod, useAgentAsVault, payrollSettings)
```

- `payrollSettings`: Array of [address denominationToken , IFeed priceFeed, uint64 rateExpiryTime, address employeeManager (set to voting if 0x0) ] for the Payroll app

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
