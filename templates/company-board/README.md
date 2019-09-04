# Aragon Company Board template

The Company with Board template is intended to be used as the basis for a token holder governed organization that has deferred some of its decision making power to an elected committee of "board" members. The "share" tokens are freely trade-able and can be added to exchanges. The "board" is represented by non-transferable tokens that are limited to one token per address. In order to change, add, or remove board members, share holders must vote to mint or burn "board" tokens. A share holder vote is required to make significant changes to the organization, and a board member is required to create shareholder votes.

## Usage

Prepare an incomplete company-board entity:

```
template.prepareInstance(shareTokenName, shareTokenSymbol, shareVotingSettings, boardVotingSettings)
```

- `shareTokenName`: Name for the token used by share holders in the organization
- `shareTokenSymbol`: Symbol for the token used by share holders in the organization
- `shareVotingSettings`: Array of [supportRequired, minAcceptanceQuorum, voteDuration] to set up the share voting app of the organization
- `boardVotingSettings`: Array of [supportRequired, minAcceptanceQuorum, voteDuration] to set up the board voting app of the organization

Finalize company-board entity:

```
template.finalizeInstance(name, shareHolders, shareStakes, boardMembers, financePeriod, useAgentAsVault)
```

- `id`: Id for org, will assign `[id].aragonid.eth`
- `shareHolders`: Array of share holder addresses
- `shareStakes`: Array of token stakes for share holders (token has 18 decimals, multiply token amount `* 10^18`)
- `boardMembers`: Array of board member addresses (1 token will be minted for each board member)
- `financePeriod`: Initial duration for accounting periods, it can be set to zero in order to use the default of 30 days.
- `useAgentAsVault`: Use an Agent app as a more advanced form of Vault app

Alternatively, create a new company entity with a Payroll app:

```
template.finalizeInstance(name, shareHolders, shareStakes, boardMembers, financePeriod, useAgentAsVault, payrollSettings)
```

- `payrollSettings`: Array of [address denominationToken , IFeed priceFeed, uint64 rateExpiryTime, address employeeManager (set to board voting if 0x0)] for the Payroll app

## Deploying templates

After deploying ENS, APM and AragonID, just run:

```
npm run deploy:rinkeby
```

The network details will be automatically selected by the `arapp.json`'s environments.

## Permissions

| App                 | Permission            | Grantee             | Manager       |
|---------------------|-----------------------|---------------------|---------------|
| Kernel              | APP_MANAGER           | Share Voting        | Share Voting  |
| ACL                 | CREATE_PERMISSIONS    | Share Voting        | Share Voting  |
| EVMScriptRegistry   | REGISTRY_MANAGER      | Share Voting        | Share Voting  |
| EVMScriptRegistry   | REGISTRY_ADD_EXECUTOR | Share Voting        | Share Voting  |
| Board Voting        | CREATE_VOTES          | Board Token Manager | Share Voting  |
| Board Voting        | MODIFY_QUORUM         | Share Voting        | Share Voting  |
| Board Voting        | MODIFY_SUPPORT        | Share Voting        | Share Voting  |
| Share Voting        | CREATE_VOTES          | Board Token Manager | Share Voting  |
| Share Voting        | MODIFY_QUORUM         | Share Voting        | Share Voting  |
| Share Voting        | MODIFY_SUPPORT        | Share Voting        | Share Voting  |
| Agent or Vault      | TRANSFER              | Finance             | Share Voting  |
| Finance             | CREATE_PAYMENTS       | Board Voting        | Share Voting  |
| Finance             | EXECUTE_PAYMENTS      | Board Voting        | Share Voting  |
| Finance             | MANAGE_PAYMENTS       | Board Voting        | Share Voting  |
| Board Token Manager | MINT                  | Share Voting        | Share Voting  |
| Board Token Manager | BURN                  | Share Voting        | Share Voting  |
| Share Token Manager | MINT                  | Share Voting        | Share Voting  |
| Share Token Manager | BURN                  | Share Voting        | Share Voting  |

### Additional permissions if the Agent app is installed

| App                 | Permission            | Grantee             | Manager       |
|---------------------|-----------------------|---------------------|---------------|
| Agent               | RUN_SCRIPT            | Board Voting        | Share Voting  |
| Agent               | EXECUTE               | Board Voting        | Share Voting  |

### Additional permissions if the Payroll app is installed

| App                 | Permission                 | Grantee             | Manager       |
|---------------------|----------------------------|---------------------|---------------|
| Finance             | CREATE_PAYMENTS            | Payroll             | Share Voting  |
| Payroll             | ADD_BONUS_ROLE             | EOA or Board Voting | Board Voting  |
| Payroll             | ADD_EMPLOYEE_ROLE          | EOA or Board Voting | Board Voting  |
| Payroll             | ADD_REIMBURSEMENT_ROLE     | EOA or Board Voting | Board Voting  |
| Payroll             | TERMINATE_EMPLOYEE_ROLE    | EOA or Board Voting | Board Voting  |
| Payroll             | SET_EMPLOYEE_SALARY_ROLE   | EOA or Board Voting | Board Voting  |
| Payroll             | MODIFY_PRICE_FEED_ROLE     | Board Voting        | Board Voting  |
| Payroll             | MODIFY_RATE_EXPIRY_ROLE    | Board Voting        | Board Voting  |
| Payroll             | MANAGE_ALLOWED_TOKENS_ROLE | Board Voting        | Board Voting  |
