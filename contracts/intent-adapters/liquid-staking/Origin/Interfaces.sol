// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

interface IOriginStakeEth {
    function deposit() external payable returns (uint256);
}