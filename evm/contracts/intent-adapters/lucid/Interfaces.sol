// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.18;

interface IBondTeller {
    struct MintParams {
        uint256 txType;
        address token;
        address recipient;
        address referrer;
        uint256 id;
        uint256 amount;
        uint256 minAmountOut;
    }

    function purchase(
        address recipient_,
        address referrer_,
        uint256 id_,
        uint256 amount_,
        uint256 minAmountOut_
    ) external returns (uint256, uint48);
}

interface ILucidSwapRouter {
    struct SwapParams {
        address tokenIn;
        address tokenOut;
        uint amountIn;
        uint amountOutMin;
        address[] path;
        address to;
        uint deadline;
    }

    function swapExactTokensForTokens(
        uint amountIn,
        uint amountOutMin,
        address[] calldata path,
        address to,
        uint deadline
    ) external returns (uint[] memory amounts);
}
