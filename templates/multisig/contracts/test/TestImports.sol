pragma solidity 0.4.24;

import "@aragon/os/contracts/factory/ENSFactory.sol";
import "@aragon/os/contracts/factory/APMRegistryFactory.sol";
import "@aragon/os/contracts/factory/EVMScriptRegistryFactory.sol";
import "@aragon/id/contracts/FIFSResolvingRegistrar.sol";
import "@aragon/templates-shared/contracts/Migrations.sol";


// HACK to workaround truffle artifact loading on dependencies
contract TestImports {
    constructor() public {
        // solium-disable-previous-line no-empty-blocks
    }
}
