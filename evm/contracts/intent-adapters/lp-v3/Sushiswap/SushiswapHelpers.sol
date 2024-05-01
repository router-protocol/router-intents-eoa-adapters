// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import {ISushiswapNonfungiblePositionManager} from "./Interfaces.sol";

contract SushiswapHelpers {
    ISushiswapNonfungiblePositionManager
        public immutable nonFungiblePositionManager;

    constructor(address __nonFungiblePositionManager) {
        nonFungiblePositionManager = ISushiswapNonfungiblePositionManager(
            __nonFungiblePositionManager
        );
    }
}
