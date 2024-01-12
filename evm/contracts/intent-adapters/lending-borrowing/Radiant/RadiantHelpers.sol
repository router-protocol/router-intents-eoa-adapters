// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import {ILendingPool} from "./interfaces/ILendingPool.sol";
import {IWrappedTokenGateway} from "./interfaces/IWrappedTokenGateway.sol";

contract RadiantHelpers {
    ILendingPool public immutable radiantPool;
    IWrappedTokenGateway public immutable radiantWrappedTokenGateway;
    uint16 public immutable radiantReferralCode;

    constructor(
        address __radiantPool,
        address __radiantWrappedTokenGateway,
        uint16 __radiantReferralCode
    ) {
        radiantPool = ILendingPool(__radiantPool);
        radiantWrappedTokenGateway = IWrappedTokenGateway(
            __radiantWrappedTokenGateway
        );
        radiantReferralCode = __radiantReferralCode;
    }
}
