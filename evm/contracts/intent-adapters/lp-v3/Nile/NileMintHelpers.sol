// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import {INileNonFungiblePositionManager} from "./Interfaces.sol";

contract NileHelpers {
    INileNonFungiblePositionManager
        public immutable nonFungiblePositionManager;

    constructor(address __nonFungiblePositionManager) {
        nonFungiblePositionManager = INileNonFungiblePositionManager(
            __nonFungiblePositionManager
        );
    }
}
