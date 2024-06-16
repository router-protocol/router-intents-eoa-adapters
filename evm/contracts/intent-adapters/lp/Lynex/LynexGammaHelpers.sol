// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import {ILynexGamma} from "./Interfaces.sol";

contract LynexGammaHelpers {
    ILynexGamma public immutable lynexGamma;

    constructor(address __lynexGamma) {
        lynexGamma = ILynexGamma(
            __lynexGamma
        );
    }
}