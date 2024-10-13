// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import {IBaseRegisterRouter} from "./Interface.sol";

contract BaseNameRegistryHelpers {
    IBaseRegisterRouter public immutable registerModule;

    constructor(address __registerModule) {
        registerModule = IBaseRegisterRouter(
            __registerModule
        );
    }
}