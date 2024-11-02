// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import {ITokenLaunch} from "./Interface.sol";

contract TokenLaunchHelpers {
    ITokenLaunch public immutable tokenPreMinting;
    constructor(address __tokenPreMinting) {
        tokenPreMinting = ITokenLaunch(
            __tokenPreMinting
        );
    }
}