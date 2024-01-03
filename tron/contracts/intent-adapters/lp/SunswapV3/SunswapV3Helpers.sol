// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

import {ISunswapNonfungiblePositionManager} from "./Interfaces.sol";

contract SunswapHelpers {
    ISunswapNonfungiblePositionManager
        private immutable _nonFungiblePositionManager;

    constructor(address __nonFungiblePositionManager) {
        _nonFungiblePositionManager = ISunswapNonfungiblePositionManager(
            __nonFungiblePositionManager
        );
    }

    function positionManager()
        public
        view
        returns (ISunswapNonfungiblePositionManager)
    {
        return _nonFungiblePositionManager;
    }
}
