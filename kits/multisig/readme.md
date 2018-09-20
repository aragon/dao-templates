# Aragon 0.5 beta templates

See [Beta templates description](https://github.com/aragon/dao-kits/blob/master/kits/beta/readme.md).

## Usage

```
msTemp.newInstance(name, signers, neededSignatures)
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
