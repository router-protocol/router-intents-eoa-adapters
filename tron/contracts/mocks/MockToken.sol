// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockToken is ERC20 {
    // solhint-disable-next-line no-empty-blocks
    constructor() ERC20("Token", "TKN") {}

    function mint(address recipient, uint256 amount) external {
        _mint(recipient, amount);
    }
}
