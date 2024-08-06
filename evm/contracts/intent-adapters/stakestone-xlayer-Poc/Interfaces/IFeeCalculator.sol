// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

interface IFeeCalculator {
    struct Fee {
        uint80 flatFee;
        uint80 maxFee;
        uint80 bpsFee;
    }

    function setFee(Fee memory _feeConfig) external;

    function calculateFee(uint256 amount) external view returns (uint256);

    function adminWithdraw(
        address token,
        address recipient,
        uint256 amount
    ) external;
}
