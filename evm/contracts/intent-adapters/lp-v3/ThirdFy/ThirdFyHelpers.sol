// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import {IThirdFyNonfungiblePositionManager} from "./Interfaces.sol";

contract ThirdFyHelpers {
    IThirdFyNonfungiblePositionManager
        public immutable nonFungiblePositionManager;

    constructor(address __nonFungiblePositionManager) {
        nonFungiblePositionManager = IThirdFyNonfungiblePositionManager(
            __nonFungiblePositionManager
        );
    }
}
