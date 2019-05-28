pragma solidity 0.4.18;

import "./IFinance.sol";
import "./TokenFactory.sol";


contract Depositer {
    TokenFactory factory;

    function Depositer(TokenFactory _factory) {
        factory = _factory;
    }

    function pleaseAirdrop(IFinance finance, Token token, uint256 many, string why) {
        factory.mint(token, this, many);
        token.approve(finance, many);
        finance.deposit(token, many, why);
    }
}
