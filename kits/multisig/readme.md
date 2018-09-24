# Aragon 0.5 beta templates

See [Beta templates description](https://github.com/aragon/dao-kits/blob/master/kits/beta/readme.md).

## Usage

```
multisig.newInstance(name, signers, neededSignatures)
```

- `name`: Name for org, will assign `[name].aragonid.eth` (check capitalization).
- `signers`: Array of addresses that are the multisig signatoires
(they will be issued 1 token).
- `neededSignatures`: Number of signers that need to sign to execute an action
(parametrized Voting app under the hood).

## Deploying templates

After deploying ENS, APM and AragonID. Change `index.js` ENS address for the
deployment network.

Then just:

```
npm run deploy:rinkeby
```

## Gas usage

Tested running `GAS_REPORTER=true truffle test --network devnet test/gas.js`

- Create the Kit:      2842826
- Create new token:    1708050
- Deploy new instance: 5522866
