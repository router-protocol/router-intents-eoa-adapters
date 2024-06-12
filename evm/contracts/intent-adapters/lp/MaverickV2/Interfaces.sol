// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

struct SupplyData {
    address tokenA;
    address tokenB;
    uint256 tokenAAmount;
    uint256 tokenBAmount;
    address recipient;
    bytes[] data;
}

interface IMaverickV2RewardsRouter {
    function multicall(
        bytes[] calldata data
    ) external returns (bytes[] memory results);

    /**
     * @notice Function to check if the price of a pool is within specified bounds.
     * @param pool The MaverickV2Pool contract to check.
     * @param minSqrtPrice The minimum acceptable square root price.
     * @param maxSqrtPrice The maximum acceptable square root price.
     */
    function checkSqrtPrice(
        IMaverickV2Pool pool,
        uint256 minSqrtPrice,
        uint256 maxSqrtPrice
    ) external view;

    /**
     * @notice Mint new tokenId in the Position NFT contract. Both mints an NFT
     * and adds liquidity to the pool that is held by the NFT.
     * @dev Caller must approve this LiquidityManager contract to spend the
     * caller's token A/B in order to fund the liquidity position.
     *
     * See addLiquidity for a description of the add params.
     */
    function mintPositionNft(
        IMaverickV2Pool pool,
        address recipient,
        bytes calldata packedSqrtPriceBreaks,
        bytes[] calldata packedArgs
    )
        external
        payable
        returns (
            uint256 tokenAAmount,
            uint256 tokenBAmount,
            uint32[] memory binIds,
            uint256 tokenId
        );

    /**
     * @notice Maverick V2 NFT position contract that tracks NFT-based
     * liquditiy positions.
     */
    function position() external view returns (IMaverickV2Position);
}

interface IMaverickV2PoolLens {
    struct TickDeltas {
        uint256 deltaAOut;
        uint256 deltaBOut;
        uint256[] deltaAs;
        uint256[] deltaBs;
    }

    /**
     * @notice Multi-price add param specification.
     * @param slippageFactorD18 Max slippage allowed as a percent in D18 scale. e.g. 1% slippage is 0.01e18
     * @param numberOfPriceBreaksPerSide Number of price break values on either
     * side of current price.
     * @param targetAmount Target token contribution amount in tokenA if
     * targetIsA is true, otherwise this is the target amount for tokenB.
     * @param targetIsA  Indicates if the target amount is for tokenA or tokenB
     */
    struct AddParamsSpecification {
        uint256 slippageFactorD18;
        uint256 numberOfPriceBreaksPerSide;
        uint256 targetAmount;
        bool targetIsA;
    }

    /**
     * @notice Add liquidity slippage parameters for a distribution of liquidity.
     * @param pool Pool where liquidity is being added.
     * @param kind Bin kind; all bins must have the same kind in a given call
     * to addLiquidity.
     * @param ticks Array of tick values to add liquidity to.
     * @param relativeLiquidityAmounts Relative liquidity amounts for the
     * specified ticks.  Liquidity in this case is not bin LP balance, it is
     * the bin liquidity as defined by liquidity = deltaA / (sqrt(upper) -
     * sqrt(lower)) or deltaB = liquidity / sqrt(lower) - liquidity /
     * sqrt(upper).
     * @param addSpec Slippage specification.
     */
    struct AddParamsViewInputs {
        IMaverickV2Pool pool;
        uint8 kind;
        int32[] ticks;
        uint128[] relativeLiquidityAmounts;
        AddParamsSpecification addSpec;
    }

    /**
     * @notice Converts add parameter slippage specification into add
     * parameters.  The return values are given in both raw format and as packed
     * values that can be used in the LiquidityManager contract.
     */
    function getAddLiquidityParams(
        AddParamsViewInputs memory params
    )
        external
        view
        returns (
            bytes memory packedSqrtPriceBreaks,
            bytes[] memory packedArgs,
            uint88[] memory sqrtPriceBreaks,
            IMaverickV2Pool.AddLiquidityParams[] memory addParams,
            IMaverickV2PoolLens.TickDeltas[] memory tickDeltas
        );

    /**
     * @notice Pool sqrt price.
     */
    function getPoolSqrtPrice(
        IMaverickV2Pool pool
    ) external view returns (uint256 sqrtPrice);
}

interface IMaverickV2Quoter {
    /**
     * @notice Computes the token amounts required for a given set of
     * addLiquidity parameters. The gas estimate is only a rough estimate and
     * may not match a add's gas.
     */
    function calculateAddLiquidity(
        IMaverickV2Pool pool,
        IMaverickV2Pool.AddLiquidityParams calldata params
    ) external returns (uint256 amountA, uint256 amountB, uint256 gasEstimate);
}

interface IMaverickV2Position {
    struct PositionPoolBinIds {
        IMaverickV2Pool pool;
        uint32[] binIds;
    }

    struct PositionFullInformation {
        PositionPoolBinIds poolBinIds;
        uint256 amountA;
        uint256 amountB;
        uint256[] binAAmounts;
        uint256[] binBAmounts;
        int32[] ticks;
        uint256[] liquidities;
    }

    /**
     * @notice NFT asset information for a given pool/binIds index. This
     * function only returns the liquidity in the pools/binIds stored as part
     * of the tokenIdData, but it is possible that the NFT has additional
     * liquidity in pools/binIds that have not been recorded.
     */
    function tokenIdPositionInformation(
        uint256 tokenId,
        uint256 index
    ) external view returns (PositionFullInformation memory output);

    function ownerOf(uint256 tokenId) external view returns (address);
}

interface IMaverickV2Pool {
    /**
     * @notice Parameters associated with adding liquidity.
     * @param kind One of the 4 kinds (0=static, 1=right, 2=left, 3=both).
     * @param ticks Array of ticks to add liquidity to.
     * @param amounts Array of bin LP amounts to add.
     */
    struct AddLiquidityParams {
        uint8 kind;
        int32[] ticks;
        uint128[] amounts;
    }

    /**
     * @notice State of the pool.
     * @param reserveA Pool tokenA balanceOf at end of last operation
     * @param reserveB Pool tokenB balanceOf at end of last operation
     * @param lastTwaD8 Value of log time weighted average price at last block.
     * Value is 8-decimal scale and is in the fractional tick domain.  E.g. a
     * value of 12.3e8 indicates the TWAP was 3/10ths of the way into the 12th
     * tick.
     * @param lastLogPriceD8 Value of log price at last block. Value is
     * 8-decimal scale and is in the fractional tick domain.  E.g. a value of
     * 12.3e8 indicates the price was 3/10ths of the way into the 12th tick.
     * @param lastTimestamp Last block.timestamp value in seconds for latest
     * swap transaction.
     * @param activeTick Current tick position that contains the active bins.
     * @param isLocked Pool isLocked, E.g., locked or unlocked; isLocked values
     * defined in Pool.sol.
     * @param binCounter Index of the last bin created.
     * @param protocolFeeRatioD3 Ratio of the swap fee that is kept for the
     * protocol.
     */
    struct State {
        uint128 reserveA;
        uint128 reserveB;
        int64 lastTwaD8;
        int64 lastLogPriceD8;
        uint40 lastTimestamp;
        int32 activeTick;
        bool isLocked;
        uint32 binCounter;
        uint8 protocolFeeRatioD3;
    }

    /**
     * @notice External function to get the state of the pool.
     */
    function getState() external view returns (State memory);
}
