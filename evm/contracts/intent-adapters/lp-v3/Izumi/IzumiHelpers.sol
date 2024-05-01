// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import {ILiquidityManager} from "./Interfaces.sol";

contract IzumiHelpers {
    ILiquidityManager
        public immutable liquidityManager;

    constructor(address __liquidityManager) {
        liquidityManager = ILiquidityManager(
            __liquidityManager
        );
    }
}
