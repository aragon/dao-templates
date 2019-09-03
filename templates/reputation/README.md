# Aragon Reputation template

The reputation template is intended to be used as the basis for a reputation governed organization, like a software project or meritocratic community. "Reputation" is represented as a non-transferable token without restrictions on the balance an individual account can have. By default the template allows only addresses that have earned reputation to create votes, and reputation-weighted vote is required for the organization to take any action, including awarding or redistributing reputation.

## Usage

Create a new token for the reputation entity:

```
template.newToken(name, symbol)
```

- `name`: Name for the token used in the organization
- `symbol`: Symbol for the token used in the organization

Create a new reputation entity:

```
template.newInstance(id, holders, stakes, votingSettings, financePeriod, useAgentAsVault)
```

- `id`: Id for org, will assign `[id].aragonid.eth`
- `holders`: Array of token holder addresses
- `stakes`: Array of token stakes for holders (token has 18 decimals, multiply token amount `* 10^18`)
- `votingSettings`: Array of [supportRequired, minAcceptanceQuorum, voteDuration] to set up the voting app of the organization
- `financePeriod`: Initial duration for accounting periods, it can be set to zero in order to use the default of 30 days.
- `useAgentAsVault`: Use an Agent app as a more advanced form of Vault app

Alternatively, create a new reputation entity with a Payroll app:

```
template.newInstance(name, holders, stakes, votingSettings, financePeriod, useAgentAsVault, payrollSettings)
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
