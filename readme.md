# DAO Kits [![Build Status](https://travis-ci.org/aragon/dao-templates.svg?branch=master)](https://travis-ci.org/aragon/dao-kits)

## What's a DAO Kit

The best way to kickstart an Aragon DAO is by using a Kit, or template. A kit is a set of smart contracts that will create a DAO from scratch and configure it according to some provided parameters.

Because they involve smart contract code, modifying a kit, even though really easy, must be done with extreme care. It is always recommended to do a third party security audit to the kit code if modified.

## Mainnet-ready kits

Aragon creates and certifies some of the kits in this repo. This comes without any guarantees, a kit we consider secure today may be vulnerable to an unknown security hole discovered down the road.

At the moment, the following kits are deployed on mainnet:

- [Democracy](./kits/democracy): `democracy.aragonpm.eth`
- [Multisig](./kits/multisig): `multisig.aragonpm.eth`

You can find more information about kit deployments and their addresses in the [deployments repo](https://github.com/aragon/deployments/tree/master/environments/mainnet)
