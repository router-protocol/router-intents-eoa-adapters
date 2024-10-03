// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import {IAgniPositionManager} from "./Interfaces.sol";

contract AgniHelpers {
    IAgniPositionManager
        public immutable nonFungiblePositionManager;

    constructor(address __nonFungiblePositionManager) {
        nonFungiblePositionManager = IAgniPositionManager(
            __nonFungiblePositionManager
        );
    }
}
