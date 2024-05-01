// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import {ITrisolarisRouter} from "./Interfaces.sol";

contract TrisolarisHelpers {
    ITrisolarisRouter public immutable solarisRouter;

    constructor(address __solarisRouter) {
        solarisRouter = ITrisolarisRouter(
            __solarisRouter
        );
    }
}