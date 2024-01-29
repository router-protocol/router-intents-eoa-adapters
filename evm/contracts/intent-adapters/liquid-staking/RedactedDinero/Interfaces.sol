// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

interface IPirexEth {
    function deposit(address receiver, bool shouldCompound)
    external
    payable
    returns (uint256 postFeeAmount, uint256 feeAmount);
}