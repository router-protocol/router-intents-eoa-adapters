// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

interface IStaking {
    function stake(uint256 minMETHAmount) external payable;
}