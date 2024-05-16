// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import {IThenaNonfungiblePositionManager} from "./Interfaces.sol";

contract ThenaHelpers {
    IThenaNonfungiblePositionManager
        public immutable nonFungiblePositionManager;

    constructor(address __nonFungiblePositionManager) {
        nonFungiblePositionManager = IThenaNonfungiblePositionManager(
            __nonFungiblePositionManager
        );
    }
}
