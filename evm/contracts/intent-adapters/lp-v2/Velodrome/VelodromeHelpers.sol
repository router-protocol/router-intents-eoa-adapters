// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import {IVelodromeFactory, IVelodromeRouter} from "./Interfaces.sol";

contract VelodromeHelpers {
    IVelodromeRouter public immutable veloRouter;
    IVelodromeFactory public immutable veloFactory;

    constructor(address __veloRouter, address __veloFactory) {
        veloRouter = IVelodromeRouter(
            __veloRouter
        );
        veloFactory = IVelodromeFactory(
            __veloFactory
        );
    }
}