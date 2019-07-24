# DAO Templates [![Build Status](https://travis-ci.org/aragon/dao-templates.svg?branch=master)](https://travis-ci.org/aragon/dao-templates)

## What's a DAO Template

The best way to kickstart an Aragon DAO is by using a Template, or template. A template is a set of smart contracts that will create a DAO from scratch and configure it according to some provided parameters.

Because they involve smart contract code, modifying a template, even though really easy, must be done with extreme care. It is always recommended to do a third party security audit to the template code if modified.

## Mainnet-ready templates (v0.7)

Aragon creates and certifies some of the templates in this repo. This comes without any guarantees, a template we consider secure today may be vulnerable to an unknown security hole discovered down the road.

At the moment, the following templates are deployed on mainnet:

- [Democracy](https://github.com/aragon/dao-templates/tree/aragon-v0.7/kits/democracy): `democracy.aragonpm.eth`
- [Multisig](https://github.com/aragon/dao-templates/tree/aragon-v0.7/kits/multisig): `multisig.aragonpm.eth`

You can find more information about template deployments and their addresses in the [deployments repo](https://github.com/aragon/deployments/tree/master/environments/mainnet)
