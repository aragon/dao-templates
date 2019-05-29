pragma solidity 0.4.24;

import "@aragon/id/contracts/FIFSResolvingRegistrar.sol";
import "@aragon/os/contracts/factory/ENSFactory.sol";
import "@aragon/os/contracts/factory/APMRegistryFactory.sol";
import "@aragon/os/contracts/factory/EVMScriptRegistryFactory.sol";
import "@aragon/apps-shared-migrations/contracts/Migrations.sol";


// HACK to workaround truffle artifact loading on dependencies
contract Imports {
    // solium-disable-previous-line no-empty-blocks
}
