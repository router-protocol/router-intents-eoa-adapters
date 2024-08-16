// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

interface IVault {
    function getOraclePrice() external view returns (uint256, uint256);

    function getFee(uint256 _amountInWeth) external view returns (uint256);

    function getNetAmountInWeth(uint256 _amountInWeth) external view returns (uint256);

    function setOracle(address _oracle) external;

    function setFeeContract(address _feeContract) external;

    function setMaxBlockDifference(uint256 _maxBlockDifference) external;

    function deposit(uint256 _amount, address _receiver) external returns (uint256 stoneAmount);

    function adminWithdraw(
        address token,
        address recipient,
        uint256 amount
    ) external;
}
