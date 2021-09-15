
pragma solidity ^0.4.24;

import "openzeppelin-solidity/contracts/token/ERC20/ERC20.sol";
import "openzeppelin-solidity/contracts/token/ERC20/ERC20Detailed.sol";

contract ERC20Sample is ERC20, ERC20Detailed {

   constructor(address owner, string name, string symbol) ERC20Detailed(name,symbol, 18) public {
      _mint(owner,100000e18);
   }
}