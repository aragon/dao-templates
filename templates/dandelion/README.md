# Dandelion Template <img align="right" src="https://github.com/1Hive/website/blob/master/website/static/img/bee.png" height="80px" />

An organization template intended to enable organizations to form and dissolve quickly.

### 🚨 Security review status: [Contracts audited](https://diligence.consensys.net/audits/2019/12/dandelion-organizations/)

## Overview

1Hive's Dandelion Organization template is intended to help facilitate collaboration by providing an organization structure that makes it easy for contributors easily part ways when disagreements occur. By guaranteeing that participants can exit if they disagree with the decisions other members are making, dandelion organizations are more easily able to attract capital investment.

The dandelion organization template consists of the Agent (optional), Finance, and Token Manager apps maintained by Aragon One. As well as the following applications developed and maintained by 1Hive:

- [Redemptions](https://github.com/1Hive/redemptions-app): Allows users to manage a list of eligible assets held within an organizations Vault and allow members of the organization to redeem (burn) organization token in exchange for a proportional amount of the eligible assets.
- [Token Request](https://github.com/1Hive/token-request-app): Allows users to propose minting tokens in exchange for a payment to the organization, subject to the approval of existing members.
- [Time Lock](https://github.com/1Hive/time-lock-app): Allows an organization to require users to lock a configure amount of tokens for a configurable amount of time in order to forward an intent.
- [Dandelion Voting](https://github.com/1Hive/dandelion-voting-app) An enhanced version of Aragon One's voting app which implements an ACL Oracle which allows an organization to configure permissions that restrict actions based on whether an address has recently voted Yes.

## Permissions

| App               | Permission             | Grantee                 | Manager          | ACL Oracle       |
| ----------------- | ---------------------- | ----------------------- | ---------------- | ---------------- |
| Kernel            | APP_MANAGER            | Dandelion Voting        | Dandelion Voting | None             |
| ACL               | CREATE_PERMISSIONS     | Dandelion Voting        | Dandelion Voting | None             |
| EVMScriptRegistry | REGISTRY_MANAGER       | Dandelion Voting        | Dandelion Voting | None             |
| EVMScriptRegistry | REGISTRY_ADD_EXECUTOR  | Dandelion Voting        | Dandelion Voting | None             |
| Dandelion Voting  | CREATE_VOTES           | Time Lock               | Dandelion Voting | None             |
| Dandelion Voting  | MODIFY_QUORUM          | Dandelion Voting        | Dandelion Voting | None             |
| Dandelion Voting  | MODIFY_SUPPORT         | Dandelion Voting        | Dandelion Voting | None             |
| Dandelion Voting  | MODIFY_BUFFER          | Dandelion Voting        | Dandelion Voting | None             |
| Dandelion Voting  | MODIFY_EXECUTION_DELAY | Dandelion Voting        | Dandelion Voting | None             |
| Agent or Vault    | TRANSFER               | Finance and Redemptions | Dandelion Voting | None             |
| Finance           | CREATE_PAYMENTS        | Dandelion Voting        | Dandelion Voting | None             |
| Finance           | EXECUTE_PAYMENTS       | Dandelion Voting        | Dandelion Voting | None             |
| Finance           | MANAGE_PAYMENTS        | Dandelion Voting        | Dandelion Voting | None             |
| Token Manager     | MINT                   | Token Request           | Dandelion Voting | None             |
| Token Manager     | BURN                   | Redemptions             | Dandelion Voting | None             |
| Redemptions       | ADD_TOKEN              | Dandelion Voting        | Dandelion Voting | None             |
| Redemptions       | REMOVE_TOKEN           | Dandelion Voting        | Dandelion Voting | None             |
| Redemptions       | REDEEM                 | ANY ENTITY              | Dandelion Voting | Dandelion Voting |
| Token Request     | SET_TOKEN_MANAGER      | Dandelion Voting        | Dandelion Voting | None             |
| Token Request     | SET_VAULT              | Dandelion Voting        | Dandelion Voting | None             |
| Token Request     | MODIFY_TOKENS          | Dandelion Voting        | Dandelion Voting | None             |
| Token Request     | FINALISE_TOKEN_REQUEST | Dandelion Voting        | Dandelion Voting | None             |
| Time Lock         | CHANGE_DURATION        | Dandelion Voting        | Dandelion Voting | None             |
| Time Lock         | CHANGE_AMOUNT          | Dandelion Voting        | Dandelion Voting | None             |
| Time Lock         | CHANGE_SPAM_PENALTY    | Dandelion Voting        | Dandelion Voting | None             |
| Time Lock         | LOCK_TOKENS_ROLE       | ANY ENTITY              | Dandelion Voting | Token Oracle     |
| Token Oracle      | SET_TOKEN              | Dandelion Voting        | Dandelion Voting | None             |
| Token Oracle      | SET_MIN_BALANCE        | Dandelion Voting        | Dandelion Voting | None             |

### Additional permissions if the Agent app is installed

| App   | Permission | Grantee          | Manager          |
| ----- | ---------- | ---------------- | ---------------- |
| Agent | RUN_SCRIPT | Dandelion Voting | Dandelion Voting |
| Agent | EXECUTE    | Dandelion Voting | Dandelion Voting |



## Testing

- On a separate terminal, run the aragon devchain
```
aragon devchain --network-id 15
```

- Run tests
```
npm run test
```

| Note that you will need to have all dandelion apps published to the devchain before running tests.

## Contributing

We welcome community contributions!

Please check out our [open Issues](https://github.com/1Hive/dandelion-org/issues) to get started.

If you discover something that could potentially impact security, please notify us immediately. The quickest way to reach us is via the #dev channel in our [team Keybase chat](https://keybase.io/team/1hive). Just say hi and that you discovered a potential security vulnerability and we'll DM you to discuss details.

