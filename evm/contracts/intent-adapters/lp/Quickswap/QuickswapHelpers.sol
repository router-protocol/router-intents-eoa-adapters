// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

import {IQuickswapNonfungiblePositionManager} from "./Interfaces.sol";

contract QuickswapHelpers {
    IQuickswapNonfungiblePositionManager
        private immutable _nonFungiblePositionManager;

    constructor(address __nonFungiblePositionManager) {
        _nonFungiblePositionManager = IQuickswapNonfungiblePositionManager(
            __nonFungiblePositionManager
        );
    }

    function positionManager()
        public
        view
        returns (IQuickswapNonfungiblePositionManager)
    {
        return _nonFungiblePositionManager;
    }
}
