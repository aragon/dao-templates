# TCR Kit

DAO Kit for Token Curated Registries.

## Test

If you want to test it locally, follow these steps:

- Run `docker-composer up` from `kits/beta` folder to spin up a geth image.
- Run `export OWNER=0x1f7402f55e142820ea3812106d0657103fc1709e; ./scripts/deploy_ens_apm_tokens.sh` to deploy `ENS` and `APM` and some tokens locally.
- Finally run `truffle migrate --network devnet --reset` to deploy the kit and `truffle test --network devnet` to run the tests on it.
