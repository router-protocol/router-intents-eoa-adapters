// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface ITokenLaunch {

    function buyTokens(
        address tokenAddress,
        uint256 usdAmount,
        address referrer,
        address recipient
    ) external payable;

    function buyTokensETH(
        address referrer,
        address recipient
    ) external payable;
}
