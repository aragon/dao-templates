# Aragon Company Board template

## Usage

Create new tokens and initialize DAO for the company-board entity:

```
template.prepareInstance()
```

Setup company-board DAO:

```
template.setupInstance(name, boardHolders, shareHolders, shareStakes, useAgentAsVault)
```

- `name`: Name for org, will assign `[name].aragonid.eth`
- `boardMembers`: Array of board member addresses (1 token will be minted for each board member)
- `shareHolders`: Array of share holder addresses
- `shareStakes`: Array of token stakes for share holders (token has 18 decimals, multiply token amount `* 10^18`)
- `useAgentAsVault`: Use an Agent app as a more advanced form of Vault app

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
