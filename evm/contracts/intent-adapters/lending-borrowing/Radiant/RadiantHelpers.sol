// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

import {ILendingPool} from "./interfaces/ILendingPool.sol";
import {IWrappedTokenGateway} from "./interfaces/IWrappedTokenGateway.sol";

contract RadiantHelpers {
    ILendingPool private immutable _radiantPool;
    IWrappedTokenGateway private immutable _radiantWrappedTokenGateway;
    uint16 private immutable _radiantReferralCode;

    constructor(
        address __radiantPool,
        address __radiantWrappedTokenGateway,
        uint16 __radiantReferralCode
    ) {
        _radiantPool = ILendingPool(__radiantPool);
        _radiantWrappedTokenGateway = IWrappedTokenGateway(
            __radiantWrappedTokenGateway
        );
        _radiantReferralCode = __radiantReferralCode;
    }

    function radiantPool() public view returns (ILendingPool) {
        return _radiantPool;
    }

    function radiantWrappedTokenGateway()
        public
        view
        returns (IWrappedTokenGateway)
    {
        return _radiantWrappedTokenGateway;
    }

    function radiantReferralCode() public view returns (uint16) {
        return _radiantReferralCode;
    }
}
