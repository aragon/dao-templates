# DAO Templates [![Build Status](https://travis-ci.org/aragon/dao-templates.svg?branch=master)](https://travis-ci.org/aragon/dao-templates)

## What is a template

The best way to kickstart an Aragon organization is by using a template. Templates are a set of smart contracts that will create an organization from scratch and configure it according to some provided parameters.

Because they involve smart contract code, modifying a template, even though it's usually really easy, must be done with extreme care. It is always recommended to do a third party security audit to review the template code when modified.

## Mainnet-ready templates

Aragon creates and have put most of the templates in this repo through an external audit. Despite this, they come without any guarantees; a template we consider secure today may be vulnerable to an unknown security hole discovered down the road. Moreover, once a user has created their organization, they may grant or transfer permissions in a way that makes their organization insecure.

You can find more information about template deployments and their addresses in the [deployments repo](https://github.com/aragon/deployments/tree/master/environments/mainnet).

### Aragon 0.8

With Aragon 0.8, the client has switched to the following templates:

- [Company](https://github.com/aragon/dao-templates/tree/master/templates/company): `company-template.aragonpm.eth`
- [Company-Board](https://github.com/aragon/dao-templates/tree/master/templates/company-board): `company-board-template.aragonpm.eth`
- [Membership](https://github.com/aragon/dao-templates/tree/master/templates/membership): `membership-template.aragonpm.eth`
- [Reputation](https://github.com/aragon/dao-templates/tree/master/templates/reputation): `reputation-template.aragonpm.eth`

These templates were audited as part of the 0.8 release.

### Aragon 0.7

With Aragon 0.6 and 0.7, the following templates were used by the client to create organizations for users:

- [Democracy](https://github.com/aragon/dao-templates/tree/aragon-v0.7/kits/democracy): `democracy-kit.aragonpm.eth`
- [Multisig](https://github.com/aragon/dao-templates/tree/aragon-v0.7/kits/multisig): `multisig-kit.aragonpm.eth`

These templates were audited as part of the 0.6 and 0.7 releases by WHG and Consensys Diligence.

## Build your own template!

`@aragon/templates-shared` is published on npm and contains contract, deployment, and testing utilities to help you build your own template. All of the templates in this monorepo use `templates-shared` internally.

## Help

For help and support, feel free to contact us at any time on [Discord](https://discord.gg/MxA2KDfS).
