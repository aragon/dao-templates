# Aragon Membership template

The membership template is intended to be used as the basis for a membership governed organization, like a cooperative or club. "Membership" is represented as a non-transferable token limited to one token per address. By default the template allows only members to create votes, and a vote of members is required for the organization to take any action, including the adding and removing members.

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

- `id`: Id for org, will assign `[id].aragonid.eth`
- `members`: Array of member addresses (1 token will be minted for each member)
- `votingSettings`: Array of [supportRequired, minAcceptanceQuorum, voteDuration] to set up the voting app of the organization
- `financePeriod`: Initial duration for accounting periods, it can be set to zero in order to use the default of 30 days.
- `useAgentAsVault`: Use an Agent app as a more advanced form of Vault app

Alternatively, create a new membership entity with a Payroll app:

```
template.newInstance(name, members, votingSettings, financePeriod, useAgentAsVault, payrollSettings)
```

- `payrollSettings`: Array of [address denominationToken , IFeed priceFeed, uint64 rateExpiryTime, address employeeManager (set to voting if 0x0)] for the Payroll app

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
| Agent or Vault    | TRANSFER              | Finance       | Voting  |
| Finance           | CREATE_PAYMENTS       | Voting        | Voting  |
| Finance           | EXECUTE_PAYMENTS      | Voting        | Voting  |
| Finance           | MANAGE_PAYMENTS       | Voting        | Voting  |
| Token Manager     | MINT                  | Voting        | Voting  |
| Token Manager     | BURN                  | Voting        | Voting  |

### Additional permissions if the Agent app is installed

| App               | Permission            | Grantee       | Manager |
|-------------------|-----------------------|---------------|---------|
| Agent             | RUN_SCRIPT            | Voting        | Voting  |
| Agent             | EXECUTE               | Voting        | Voting  |

### Additional permissions if the Payroll app is installed

| App                 | Permission                 | Grantee             | Manager       |
|---------------------|----------------------------|---------------------|---------------|
| Finance             | CREATE_PAYMENTS            | Payroll             | Voting        |
| Payroll             | ADD_BONUS_ROLE             | EOA or Voting       | Voting        |
| Payroll             | ADD_EMPLOYEE_ROLE          | EOA or Voting       | Voting        |
| Payroll             | ADD_REIMBURSEMENT_ROLE     | EOA or Voting       | Voting        |
| Payroll             | TERMINATE_EMPLOYEE_ROLE    | EOA or Voting       | Voting        |
| Payroll             | SET_EMPLOYEE_SALARY_ROLE   | EOA or voting       | Voting        |
| Payroll             | MODIFY_PRICE_FEED_ROLE     | Voting              | Voting        |
| Payroll             | MODIFY_RATE_EXPIRY_ROLE    | Voting              | Voting        |
| Payroll             | MANAGE_ALLOWED_TOKENS_ROLE | Voting              | Voting        |
