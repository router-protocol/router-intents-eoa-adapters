// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import {ILynexRouter} from "./Interfaces.sol";

contract LynexHelpers {
    ILynexRouter public immutable lynexRouter;

    constructor(address __lynexRouter) {
        lynexRouter = ILynexRouter(__lynexRouter);
    }
}
