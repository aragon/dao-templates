![In Aragon We Trust](https://cdn-images-1.medium.com/max/1400/1*ycnh8TX8JkIor7wflKH3Vw.jpeg)

# Aragon Trust

An Aragon [Trust](https://www.investopedia.com/terms/t/trust.asp) is a kind of Aragon entity in which the trustee is
the entity itself.


## Goals

- Stores assets on the [Gnosis multisig](https://github.com/gnosis/MultiSigWallet), which is the most proven smart
  contract for storing assets, while still having the flexibility of an Aragon entity.

- Allows for painless transfers with hot keys, to reduce the possibility of losing cold keys and the effort it takes to
  safeguard them.

- Lets the beneficiary immediately access funds if needed, with extra steps. By default, implements a time delay.

- Allows for the beneficiary to define heirs that can withdraw assets collectively (dead man's switch). They can also
  become a recovery mechanism.

> Disclaimer: This technology makes it easier to implement inheritance, but keep in mind that no technology can ensure
that the funds are eventually directed towards the people or causes you originally intend to support.


## Governance structure

> Note: support percentages and time delays can be tweaked as you want, these are just sensible defaults.

Aragon Trusts are composed of two sub-groups:

- Beneficiary (token symbol HOLD)
- Heirs (token symbol HEIR)


### Multisig

- Signers:
  - Key #1
  - Key #2
  - DAO (via [Aragon Agent](https://blog.aragon.one/aragon-agent-beta-release/))


### DAO

- **Token (HOLD)**: This token would be given to
  - Key #3: This can be a very hot key
  - Key #4: This can be hot, but should take some time to access it. It acts as a two factor auth

- **Voting (HOLD)**: All keys combined can move funds immediately, one can move funds with one week delay, one can veto the transfer
  - Support: 100%
  - Quorum: 0%
  - Duration: One week

- **Token (HEIRS)**: Arbitrary number of tokens
  - 34% of HEIRS tokens are locked to the address zero. This is so HEIRS votes always take their full duration, and are
    not immediately executed. If the beneficiary has passed away, then you need 66% of all remaining HEIRS holders to
    vote yes to transfer the funds.

- **Voting (HEIRS)**: All transfers have 1 year delay and the beneficiary can revoke the permission for the HEIRS holders to transfer funds
  - Support: 66%
  - Quorum: 0%
  - Duration: One year


### DAO permissions

| App                   | Permission            | Grantee             | Permission manager |
| --------------------- | --------------------- | ------------------- | ------------------ |
| Kernel                | APP_MANAGER           | Hold Voting         | Hold Voting        |
| ACL                   | CREATE_PERMISSIONS    | Hold Voting         | Hold Voting        |
| EVMScriptRegistry     | REGISTRY_MANAGER      | Hold Voting         | Hold Voting        |
| EVMScriptRegistry     | REGISTRY_ADD_EXECUTOR | Hold Voting         | Hold Voting        |
| Hold Voting           | CREATE_VOTES          | Hold Token Manager  | Hold Voting        |
| Hold Voting           | MODIFY_QUORUM         | Hold Voting         | Hold Voting        |
| Hold Voting           | MODIFY_SUPPORT        | Hold Voting         | Hold Voting        |
| Heirs Voting          | CREATE_VOTES          | Heirs Token Manager | Heirs Voting       |
| Heirs Voting          | MODIFY_QUORUM         | Heirs Voting        | Heirs Voting       |
| Heirs Voting          | MODIFY_SUPPORT        | Heirs Voting        | Heirs Voting       |
| Agent                 | EXECUTE               | Hold Voting         | Hold Voting        |
| Agent                 | RUN_SCRIPT            | Hold Voting         | Hold Voting        |
| Agent                 | EXECUTE               | Heirs Voting        | Hold Voting        |
| Agent                 | RUN_SCRIPT            | Heirs Voting        | Hold Voting        |
| Vault                 | TRANSFER              | Finance             | Hold Voting        |
| Finance               | CREATE_PAYMENTS       | Hold Voting         | Hold Voting        |
| Finance               | EXECUTE_PAYMENTS      | Hold Voting         | Hold Voting        |
| Finance               | MANAGE_PAYMENTS       | Hold Voting         | Hold Voting        |
| Hold Token Manager    | MINT                  | Multisig            | Multisig           |
| Hold Token Manager    | BURN                  | Multisig            | Multisig           |
| Hold Token Manager    | ASSIGN                | Hold Voting         | Hold Voting        |
| Hold Token Manager    | REVOKE_VESTINGS       | Hold Voting         | Hold Voting        |
| Heirs Token Manager   | MINT                  | Multisig            | Multisig           |
| Heirs Token Manager   | BURN                  | Multisig            | Multisig           |
| Heirs Token Manager   | ASSIGN                | Heirs Voting        | Heirs Voting       |
| Heirs Token Manager   | REVOKE_VESTINGS       | Heirs Voting        | Heirs Voting       |


## Usage

Create new tokens and initialize DAO for the trust entity:

```
template.prepareInstance()
```

Setup trust DAO:

```
template.setupInstance(name, beneficiaryKeys, heirs, heirsStakes)
```

- `id`: Id for org, will assign `[id].aragonid.eth`
- `beneficiaryKeys`: 2-length array with the beneficiaries keys
- `heirs`: Array of heirs addresses
- `stakes`: Array of token stakes for heirs (token has 18 decimals, multiply token amount `* 10^18`)

Create new Gnosis multisig wallet for the trust DAO:

```
template.setupMultiSig(multisigKeys)
```

- `multisigKeys`: 2-length array with the beneficiaries keys


## Deploying templates

After deploying ENS, APM and AragonID, just run:

```
npm run deploy:rinkeby
```

The network details will be automatically selected by the `arapp.json`'s environments.


## Threat model

- The two multisig keys cannot get lost or stolen at the same time

- The DAO cannot break while also one multisig key gets lost or stolen

- Always initiate transactions to the multisig with key #2 and confirm with the DAO. Otherwise, attackers can predict
  that the vote will take one week and go to you the exact moment that you would need to sign the confirmation with key #4

- One of the hot keys in the DAO needs to be stored in a way so it takes you some effort to sign with it, in order to
  [prevent wrench attacks](https://xkcd.com/538/)

- If one of the keys in the DAO gets stolen, you should immediately burn its token by using the multisig

- The beneficiary needs to revoke the *Execute action* permission from the HEIRS Voting if HEIRS holders create
  a vote when the beneficiary is still alive

- Key #2 needs to be transmitted to the heirs in some way. You can even pre-sign a transaction that moves the funds to
  another address (e.g. a DAO composed of the people of your choice) and send your heirs a
  [Shamir Secret](https://en.wikipedia.org/wiki/Shamir%27s_Secret_Sharing) that they can put together to execute that transfer
