// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

interface ISharedStakeDepositMinter {
    function deposit() external payable;

    function depositFor(address dest) external payable;

    function depositAndStake() external payable;

    function depositAndStakeFor(address dest) external payable;
}