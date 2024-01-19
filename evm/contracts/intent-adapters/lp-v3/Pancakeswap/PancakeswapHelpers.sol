// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import {IPancakeswapNonfungiblePositionManager} from "./Interfaces.sol";

contract PancakeswapHelpers {
    IPancakeswapNonfungiblePositionManager
        public immutable nonFungiblePositionManager;

    constructor(address __nonFungiblePositionManager) {
        nonFungiblePositionManager = IPancakeswapNonfungiblePositionManager(
            __nonFungiblePositionManager
        );
    }
}
