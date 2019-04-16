# Aragon 0.7 beta templates

## Description

This is the common base needed for [Democracy](https://github.com/aragon/dao-kits/blob/master/kits/democracy/readme.md) and [Multisig](https://github.com/aragon/dao-kits/blob/master/kits/multisig/readme.md) templates, both in separate packages in this repo.
In both templates, a Voting app is created that has power over all important
functionality in the organization.

The difference between them is how the Voting app is configured and the token
distribution.

## Install local environment

- Install [Docker CE](https://docs.docker.com/install/)
- `cd kits/beta-base && npm run docker:run`
- Outputted ENS address has to be provided to the client
- That's really it 🦅🚀

## Usage

Both templates may require 2 transactions to completely set up an organization, due
to gas costs: one to create the token (which is cached in the template) and one to
create the organization and finish the setup.

- Both transactions have to be done by the same sender (cache reasons).
- Thanks to account nonces, we can prompt the user to sign and broadcast both
transactions without requiring the user to wait for the first one to be mined,
and we can be sure that they will be mined in order.
Metamask will probably tell the user the second transaction will fail, but that's
because they don't know better (they don't calculate the state as if the first
transaction was already mined).
- Addresses for deployed templates on individual networks can be found in
  [`aragon/deployments`](https://github.com/aragon/deployments).

### 1. Token creation

- `democracyTemp.newToken(name, symbol)`
- `multiSigTemp.newToken(name)`

On success it will emit a `DeployToken(token, cacheOwner)` event.

### 2. Organization creation

- On success it will emit a `DeployInstance(dao, token)` event.
- Requires `cacheOwner` to send this transaction too.

Then see each template's documentation for their own specific transactions.

## ENS, APM and aragonID

Our fake ENS instance that we use across the entire system can also be found in
[`aragon/deployments`](https://github.com/aragon/deployments).

Using it as the ENS registry, we can find everything else by using ENS.

- `APM` -> `ens.addr('aragonpm.eth')`
- `AragonID` -> `ens.owner('aragonid.eth')` (notice it is owner and not addr)

### aragonID

After fetching AragonID from ENS, registering a name for an address can be done:

```
aragonID.register(keccak256(name), addr)
```

Note that if the name already exists, the transaction will revert (see gotchas).

### APM

The deployed APM Registry has a pretty tight governance mechanism which only allows
certain individuals (Aragon core team) to create new repos and different repos
are managed by different team members.

Templates will deploy the last version of the apps according to their APM repos,
this will allow us to update the apps without the need to update templates.

Repos can be found by resolving the repo appId in ENS (e.g. `ens.resolve('voting.aragonpm.eth')`).
New versions have to be submitted directly to the repo address. If you don't
have permission to do so, please ask the permission manager (aka Jorge).

## Gotchas

- Because of aragonID registration, trying to create an organization with the
name of an existing one will fail. For the client, an easy way to check is
whether `[name].aragonid.eth` owner's is `0x00...00`

## Deploying templates

See instructions in each template's individual documentation.
