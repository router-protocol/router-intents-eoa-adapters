// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

interface IStablesDepositsVault {
    function deposit(address depositAsset, uint256 depositAmount, uint256 minimumMint) external payable returns (uint256 shares);
}

interface IETHDepositsVault {
    function deposit(address depositAsset, uint256 depositAmount, uint256 minimumMint) external payable returns (uint256 shares);
}

interface IBTCDepositsVault {
    function deposit(address depositAsset, uint256 depositAmount, uint256 minimumMint) external payable returns (uint256 shares);
}
