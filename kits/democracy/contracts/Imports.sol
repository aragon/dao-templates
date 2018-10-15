/* solium-disable */
pragma solidity 0.4.24;

// HACK to workaround truffle artifact loading on dependencies

import "@aragon/os/contracts/factory/ENSFactory.sol";
import "@aragon/os/contracts/factory/APMRegistryFactory.sol";
import "@aragon/os/contracts/factory/EVMScriptRegistryFactory.sol";
import "@aragon/id/contracts/FIFSResolvingRegistrar.sol";
import "@aragon/apps-shared-migrations/contracts/Migrations.sol";


contract Imports {}
