// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import {ICamelotNonfungiblePositionManager} from "./Interfaces.sol";

contract CamelotHelpers {
    ICamelotNonfungiblePositionManager
        public immutable nonFungiblePositionManager;

    constructor(address __nonFungiblePositionManager) {
        nonFungiblePositionManager = ICamelotNonfungiblePositionManager(
            __nonFungiblePositionManager
        );
    }
}
