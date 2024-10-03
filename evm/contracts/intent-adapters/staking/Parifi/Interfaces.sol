// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

interface IParifiVault {

    /// @notice deposit token in parifi and get pfTokens
    /// @param assets the amount of asset to be deposited
    /// @param receiver address of the receiver of pfTokens
    function deposit(uint256 assets, address receiver) external returns (uint256);
}