// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import {INonfungiblePositionManager} from "./Interfaces.sol";

contract SwapModeHelpers {
    INonfungiblePositionManager
        public immutable nonFungiblePositionManager;

    constructor(address __nonFungiblePositionManager) {
        nonFungiblePositionManager = INonfungiblePositionManager(
            __nonFungiblePositionManager
        );
    }
}
