# Aragon 0.5 Democracy template

See [Beta templates description](https://github.com/aragon/dao-kits/blob/master/kits/beta/readme.md).

## Usage

```
demTemp.newInstance(name, holders, stakes, supportNeeded, minAcceptanceQuorum, voteDuration)
```

- `name`: Name for org, will assign `[name].aragonid.eth` (check capitalization).
- `holders`: Array of token holder addresses.
- `stakes`: Array of token stakes for holders (token has 18 decimals, multiply token amount `* 10^18`)
- `supportNeeded, minAcceptanceQuorum, voteDuration`: Check [Voting app spec]
(https://wiki.aragon.one/dev/apps/voting/).

## Deploying templates

After deploying ENS, APM and AragonID. Change `index.js` ENS address for the
deployment network.

Then just:

```
npm run deploy:rinkeby
```
