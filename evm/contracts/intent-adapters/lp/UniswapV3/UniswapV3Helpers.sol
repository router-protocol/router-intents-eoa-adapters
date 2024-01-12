// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import {IUniswapV3NonfungiblePositionManager} from "./Interfaces.sol";

contract UniswapV3Helpers {
    IUniswapV3NonfungiblePositionManager
        public immutable nonFungiblePositionManager;

    constructor(address __nonFungiblePositionManager) {
        nonFungiblePositionManager = IUniswapV3NonfungiblePositionManager(
            __nonFungiblePositionManager
        );
    }
}
