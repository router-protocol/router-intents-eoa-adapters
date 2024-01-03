// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

import {IPoolV3} from "./interfaces/IPoolV3.sol";
import {IWrappedTokenGateway} from "./interfaces/IWrappedTokenGateway.sol";

contract AaveV3Helpers {
    IPoolV3 private immutable _aaveV3Pool;
    IWrappedTokenGateway private immutable _aaveV3WrappedTokenGateway;
    uint16 private immutable _aaveV3ReferralCode;

    constructor(
        address __aaveV3Pool,
        address __aaveV3WrappedTokenGateway,
        uint16 __aaveV3ReferralCode
    ) {
        _aaveV3Pool = IPoolV3(__aaveV3Pool);
        _aaveV3WrappedTokenGateway = IWrappedTokenGateway(
            __aaveV3WrappedTokenGateway
        );
        _aaveV3ReferralCode = __aaveV3ReferralCode;
    }

    function aaveV3Pool() public view returns (IPoolV3) {
        return _aaveV3Pool;
    }

    function aaveV3WrappedTokenGateway()
        public
        view
        returns (IWrappedTokenGateway)
    {
        return _aaveV3WrappedTokenGateway;
    }

    function aaveV3ReferralCode() public view returns (uint16) {
        return _aaveV3ReferralCode;
    }
}
