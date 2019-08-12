# Aragon Company Board template

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

- `name`: Name for org, will assign `[name].aragonid.eth`
- `shareHolders`: Array of share holder addresses
- `shareStakes`: Array of token stakes for share holders (token has 18 decimals, multiply token amount `* 10^18`)
- `boardMembers`: Array of board member addresses (1 token will be minted for each board member)
- `financePeriod`: Initial duration for accounting periods, it can be set to zero in order to use the default of 30 days.
- `useAgentAsVault`: Use an Agent app as a more advanced form of Vault app

Alternatively, create a new company entity with a Payroll app:

```
template.finalizeInstance(name, shareHolders, shareStakes, boardMembers, financePeriod, useAgentAsVault, payrollSettings)
```

- `payrollSettings`: Array of [address denominationToken , IFeed priceFeed, uint64 rateExpiryTime, address employeeManager (set to board voting if 0x0) ] for the Payroll app

## Deploying templates

After deploying ENS, APM and AragonID, just run:

```
npm run deploy:rinkeby
```

The network details will be automatically selected by the `arapp.json`'s environments.

## Permissions

| App                 | Permission            | Grantee             | Manager       |
|---------------------|-----------------------|---------------------|---------------|
| Kernel              | APP_MANAGER           | Board Voting        | Share Voting  |
| ACL                 | CREATE_PERMISSIONS    | Board Voting        | Share Voting  |
| EVMScriptRegistry   | REGISTRY_MANAGER      | Share Voting        | Share Voting  |
| EVMScriptRegistry   | REGISTRY_ADD_EXECUTOR | Share Voting        | Share Voting  |
| Board Voting        | CREATE_VOTES          | Board Token Manager | Share Voting  |
| Board Voting        | MODIFY_QUORUM         | Share Voting        | Share Voting  |
| Board Voting        | MODIFY_SUPPORT        | Share Voting        | Share Voting  |
| Share Voting        | CREATE_VOTES          | Board Token Manager | Share Voting  |
| Share Voting        | MODIFY_QUORUM         | Share Voting        | Share Voting  |
| Share Voting        | MODIFY_SUPPORT        | Share Voting        | Share Voting  |
| Agent               | TRANSFER              | Finance             | Share Voting  |
| Agent               | RUN_SCRIPT            | Board Voting        | Share Voting  |
| Agent               | RUN_SCRIPT            | Share Voting        | Share Voting  |
| Agent               | EXECUTE               | Board Voting        | Share Voting  |
| Agent               | EXECUTE               | Share Voting        | Share Voting  |
| Finance             | CREATE_PAYMENTS       | Board Voting        | Share Voting  |
| Finance             | CREATE_PAYMENTS       | Share Voting        | Share Voting  |
| Finance             | EXECUTE_PAYMENTS      | Share Voting        | Share Voting  |
| Finance             | DISABLE_PAYMENTS      | Share Voting        | Share Voting  |
| Board Token Manager | MINT                  | Share Voting        | Share Voting  |
| Board Token Manager | BURN                  | Share Voting        | Share Voting  |
| Share Token Manager | MINT                  | Share Voting        | Share Voting  |
| Share Token Manager | BURN                  | Share Voting        | Share Voting  |
