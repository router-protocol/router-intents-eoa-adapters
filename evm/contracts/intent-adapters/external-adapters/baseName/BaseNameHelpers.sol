// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import {IBaseRegisterRouter, IBaseReverseRegisterRouter, IBaseReverseResolver} from "./Interface.sol";

contract BaseNameRegistryHelpers {
    IBaseRegisterRouter public immutable registerModule;
    IBaseReverseRegisterRouter public immutable registerReverseModule;
    IBaseReverseResolver public immutable resolver;
    address public immutable reverseResolver;
    constructor(address __registerModule, address __reverseRegisterModule, address __reverseResolver, address __resolver) {
        registerModule = IBaseRegisterRouter(
            __registerModule
        );
        registerReverseModule = IBaseReverseRegisterRouter(
            __reverseRegisterModule
        );
        reverseResolver = __reverseResolver;
        resolver = IBaseReverseResolver(__resolver);
    }
}