// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import {IAerodromeRouter} from "./Interfaces.sol";

contract AerodromeHelpers {
    IAerodromeRouter public immutable aeroRouter;

    constructor(address __aeroRouter) {
        aeroRouter = IAerodromeRouter(
            __aeroRouter
        );
    }
}