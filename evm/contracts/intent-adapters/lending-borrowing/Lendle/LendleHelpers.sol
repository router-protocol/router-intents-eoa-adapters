// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import {ILendingPool} from "./interfaces/ILendingPool.sol";
import {IWrappedTokenGateway} from "./interfaces/IWrappedTokenGateway.sol";

contract LendleHelpers {
    ILendingPool public immutable lendingPool;
    IWrappedTokenGateway public immutable lendleWrappedTokenGateway;
    uint16 public immutable lendleReferralCode;

    constructor(
        address __lendingPool,
        address __lendleWrappedTokenGateway,
        uint16 __lendleReferralCode
    ) {
        lendingPool = ILendingPool(__lendingPool);
        lendleWrappedTokenGateway = IWrappedTokenGateway(
            __lendleWrappedTokenGateway
        );
        lendleReferralCode = __lendleReferralCode;
    }
}
