pragma solidity 0.4.24;

import "@aragon/apps-shared-minime/contracts/MiniMeToken.sol";


contract TokenFactoryWrapper {
    event NewToken(address token, address controller);

    function newToken(string name, string symbol) public returns (MiniMeToken token) {
        MiniMeTokenFactory minimeFac = new MiniMeTokenFactory();
        token = minimeFac.createCloneToken(
            MiniMeToken(address(0)),
            0,
            name,
            18,
            symbol,
            true
        );
        token.changeController(msg.sender);

        emit NewToken(address(token), msg.sender);

        return token;
    }

}
