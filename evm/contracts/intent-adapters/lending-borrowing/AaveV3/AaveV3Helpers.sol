// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import {IPoolV3} from "./interfaces/IPoolV3.sol";
import {IWrappedTokenGateway} from "./interfaces/IWrappedTokenGateway.sol";

contract AaveV3Helpers {
    IPoolV3 public immutable aaveV3Pool;
    IWrappedTokenGateway public immutable aaveV3WrappedTokenGateway;
    uint16 public immutable aaveV3ReferralCode;

    constructor(
        address __aaveV3Pool,
        address __aaveV3WrappedTokenGateway,
        uint16 __aaveV3ReferralCode
    ) {
        aaveV3Pool = IPoolV3(__aaveV3Pool);
        aaveV3WrappedTokenGateway = IWrappedTokenGateway(
            __aaveV3WrappedTokenGateway
        );
        aaveV3ReferralCode = __aaveV3ReferralCode;
    }
}
