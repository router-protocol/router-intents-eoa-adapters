// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import {IQuickswapNonfungiblePositionManager} from "./Interfaces.sol";

contract QuickswapHelpers {
    IQuickswapNonfungiblePositionManager
        public immutable nonFungiblePositionManager;

    constructor(address __nonFungiblePositionManager) {
        nonFungiblePositionManager = IQuickswapNonfungiblePositionManager(
            __nonFungiblePositionManager
        );
    }
}
