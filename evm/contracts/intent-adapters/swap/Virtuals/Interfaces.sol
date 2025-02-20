// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

interface VirtualsDepositsWrapper {
    function buy(
        uint256 _amountIn,
        address _tokenAddress
    ) external payable returns (bool);
}
