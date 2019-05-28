pragma solidity 0.4.18;

import "./token/ERC20.sol";


interface IFinance {
    function deposit(ERC20 token, uint256 amount, string why) public;
}
