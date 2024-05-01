// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import {IKimNonfungiblePositionManager} from "./Interfaces.sol";

contract KimHelpers {
    IKimNonfungiblePositionManager
        public immutable nonFungiblePositionManager;

    constructor(address __nonFungiblePositionManager) {
        nonFungiblePositionManager = IKimNonfungiblePositionManager(
            __nonFungiblePositionManager
        );
    }
}
