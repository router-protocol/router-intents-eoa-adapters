// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.18;

abstract contract ILiquidityManager {

    struct MintParams {
        // miner address
        address miner;
        // tokenX of swap pool
        address tokenX;
        // tokenY of swap pool
        address tokenY;
        // fee amount of swap pool
        uint24 fee;
        // left point of added liquidity
        int24 pl;
        // right point of added liquidity
        int24 pr;
        // amount limit of tokenX miner willing to deposit
        uint128 xLim;
        // amount limit tokenY miner willing to deposit
        uint128 yLim;
        // minimum amount of tokenX miner willing to deposit
        uint128 amountXMin;
        // minimum amount of tokenY miner willing to deposit
        uint128 amountYMin;
        uint256 deadline;
    }

    function mint(MintParams calldata mintParams) external payable virtual returns(
        uint256 lid,
        uint128 liquidity,
        uint256 amountX,
        uint256 amountY
    );

    struct AddLiquidityParam {
        // id of nft
        uint256 lid;
        // amount limit of tokenX user willing to deposit
        uint128 xLim;
        // amount limit of tokenY user willing to deposit
        uint128 yLim;
        // min amount of tokenX user willing to deposit
        uint128 amountXMin;
        // min amount of tokenY user willing to deposit
        uint128 amountYMin;

        uint256 deadline;
    }

    function addLiquidity(
        AddLiquidityParam calldata addLiquidityParam
    ) external payable virtual returns (
        uint128 liquidityDelta,
        uint256 amountX,
        uint256 amountY
    );

    function decLiquidity(
        uint256 lid,
        uint128 liquidDelta,
        uint256 amountXMin,
        uint256 amountYMin,
        uint256 deadline
    ) external virtual returns (
        uint256 amountX,
        uint256 amountY
    );

    function poolMetas(uint128 poolId) external view virtual returns(
        // tokenX of pool
        address tokenX,
        // tokenY of pool
        address tokenY,
        // fee amount of pool
        uint24 fee
    );
     
    function collect(
        address recipient,
        uint256 lid,
        uint128 amountXLim,
        uint128 amountYLim
    ) external payable virtual returns (
        uint256 amountX,
        uint256 amountY
    );
}
