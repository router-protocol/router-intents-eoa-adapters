// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import {IThirdFySwapRouter} from "./Interfaces.sol";

contract ThirdFyHelpers {
    IThirdFySwapRouter
        public immutable swapRouter;

    constructor(address __swapRouter) {
        swapRouter = IThirdFySwapRouter(
            __swapRouter
        );
    }
}
