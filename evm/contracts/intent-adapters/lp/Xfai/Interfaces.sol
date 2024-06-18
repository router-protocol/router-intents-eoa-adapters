// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IXfaiV0Periphery03 {

    struct XfaiSupplyData {
        address _to;
        address _token;
        uint _amountTokenDesired;
        uint _amountETHDesired;
        uint _amountTokenMin;
        uint _amountETHMin;
        uint _deadline;
    }

    /**
     * @notice Provide two-sided liquidity to a pool
     * @dev Requires _token approval. A given amount of _token and ETH get consumed and a given amount of liquidity tokens is minted
     * @param _to The address of the recipient
     * @param _token An ERC20 token address
     * @param _amountTokenDesired The input amount of _token to be provided
     * @param _amountTokenMin The minimal amount that the user will accept for _amountTokenDesired
     * @param _amountETHMin The minimal amount that the user will accept for the provided ETH
     * @param _deadline The UTC timestamp that if reached, causes the transaction to fail automatically
     */
    function addLiquidity(
        address _to,
        address _token,
        uint _amountTokenDesired,
        uint _amountTokenMin,
        uint _amountETHMin,
        uint _deadline
    ) external payable returns (uint liquidity);

    function removeLiquidity(
        address _to,
        address _token0,
        address _token1,
        uint _liquidity,
        uint _amount0Min,
        uint _amount1Min,
        uint _deadline
    ) external returns (uint amount0, uint amount1);

    function swapExactTokensForTokens(
        address _to,
        address _token0,
        address _token1,
        uint _amount0In,
        uint _amount1OutMin,
        uint _deadline
    ) external returns (uint);

    function swapTokensForExactTokens(
        address _to,
        address _token0,
        address _token1,
        uint _amount1Out,
        uint _amount0InMax,
        uint _deadline
    ) external returns (uint);

    function swapExactETHForTokens(
        address _to,
        address _token,
        uint _amountOutMin,
        uint _deadline
    ) external payable returns (uint amountOut);

    function swapTokensForExactETH(
        address _to,
        address _token,
        uint _amountOut,
        uint _amountInMax,
        uint _deadline
    ) external returns (uint input);

    function swapExactTokensForETH(
        address _to,
        address _token,
        uint _amountIn,
        uint _amountOutMin,
        uint _deadline
    ) external returns (uint output);

    function swapETHForExactTokens(
        address _to,
        address _token,
        uint _amountOut,
        uint _deadline
    ) external payable returns (uint input);
}
