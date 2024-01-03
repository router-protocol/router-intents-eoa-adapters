// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

import {ISushiswapNonfungiblePositionManager} from "./Interfaces.sol";

contract SushiswapHelpers {
    ISushiswapNonfungiblePositionManager
        private immutable _nonFungiblePositionManager;

    constructor(address __nonFungiblePositionManager) {
        _nonFungiblePositionManager = ISushiswapNonfungiblePositionManager(
            __nonFungiblePositionManager
        );
    }

    function positionManager()
        public
        view
        returns (ISushiswapNonfungiblePositionManager)
    {
        return _nonFungiblePositionManager;
    }
}
