// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import {IVelocoreVault} from "./Interfaces.sol";

contract VelocoreHelpers {
    IVelocoreVault public immutable velocoreVault;
    address public immutable velocoreToken;

    constructor(address __velocoreVault, address __velocoreToken) {
        velocoreVault = IVelocoreVault(
            __velocoreVault
        );
        velocoreToken = __velocoreToken;
    }
}