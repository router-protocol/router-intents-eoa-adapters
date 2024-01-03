// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

import {IPancakeswapNonfungiblePositionManager} from "./Interfaces.sol";

contract PancakeswapHelpers {
    IPancakeswapNonfungiblePositionManager
        private immutable _nonFungiblePositionManager;

    constructor(address __nonFungiblePositionManager) {
        _nonFungiblePositionManager = IPancakeswapNonfungiblePositionManager(
            __nonFungiblePositionManager
        );
    }

    function positionManager()
        public
        view
        returns (IPancakeswapNonfungiblePositionManager)
    {
        return _nonFungiblePositionManager;
    }
}
