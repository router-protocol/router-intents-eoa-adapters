// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import {IKimRouter} from "./Interfaces.sol";

contract KimHelpers {
    IKimRouter public immutable kimRouter;

    constructor(address __kimRouter) {
        kimRouter = IKimRouter(
            __kimRouter
        );
    }
}