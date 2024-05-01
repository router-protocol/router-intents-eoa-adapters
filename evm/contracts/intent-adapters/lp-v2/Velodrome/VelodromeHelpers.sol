// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import {IVelodromeRouter} from "./Interfaces.sol";

contract VelodromeHelpers {
    IVelodromeRouter public immutable veloRouter;

    constructor(address __veloRouter) {
        veloRouter = IVelodromeRouter(
            __veloRouter
        );
    }
}