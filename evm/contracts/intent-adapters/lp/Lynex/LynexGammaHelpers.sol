// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import {ILynexGamma, ILynexClearing} from "./Interfaces.sol";

contract LynexGammaHelpers {
    ILynexGamma public immutable lynexGamma;
    ILynexClearing public immutable lynexClearing;

    constructor(address __lynexGamma, address __lynexClearing) {
        lynexGamma = ILynexGamma(__lynexGamma);
        lynexClearing = ILynexClearing(__lynexClearing);
    }
}
