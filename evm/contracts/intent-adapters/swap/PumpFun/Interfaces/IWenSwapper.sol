// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.18;

import { IWenToken } from "./IWenToken.sol";

interface IWenSwapper {
    struct WenSwapParams {
        address tokenIn;
        address tokenOut;
        uint256 amountIn;
        uint256 amountOutMin;
        address to;
        uint256 deadline;
        uint8 txType;
    }

    /// @notice Swaps ETH for tokens.
    /// @param token The token to swap.
    /// @param amountIn Input amount of ETH.
    /// @param amountOutMin Minimum output amount of token.
    /// @param to Recipient of token.
    /// @param deadline Deadline for the swap.
    /// @return amountOut The actual output amount of token.
    function swapEthForTokens(
        IWenToken token,
        uint256 amountIn,
        uint256 amountOutMin,
        address to,
        uint256 deadline
    ) external payable returns (uint256 amountOut);

    /// @notice Swaps tokens for ETH.
    /// @param token The token to swap.
    /// @param amountIn Input amount of token.
    /// @param amountOutMin Minimum output amount of ETH.
    /// @param to Recipient of ETH.
    /// @param deadline Deadline for the swap.
    /// @return amountOut The actual output amount of ETH.
    function swapTokensForEth(
        IWenToken token,
        uint256 amountIn,
        uint256 amountOutMin,
        address to,
        uint256 deadline
    ) external returns (uint256 amountOut);
}
