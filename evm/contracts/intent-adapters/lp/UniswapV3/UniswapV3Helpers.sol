// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

import {IUniswapV3NonfungiblePositionManager} from "./Interfaces.sol";

contract UniswapV3Helpers {
    IUniswapV3NonfungiblePositionManager
        private immutable _nonFungiblePositionManager;

    constructor(address __nonFungiblePositionManager) {
        _nonFungiblePositionManager = IUniswapV3NonfungiblePositionManager(
            __nonFungiblePositionManager
        );
    }

    function positionManager()
        public
        view
        returns (IUniswapV3NonfungiblePositionManager)
    {
        return _nonFungiblePositionManager;
    }
}
