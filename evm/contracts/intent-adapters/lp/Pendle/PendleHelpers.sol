// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import {IPendleRouter} from "./Interfaces.sol";

contract PendleHelpers {
    IPendleRouter public immutable pendleRouter;

    constructor(address __pendleRouter) {
        pendleRouter = IPendleRouter(
            __pendleRouter
        );
    }
}