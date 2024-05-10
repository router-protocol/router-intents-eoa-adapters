// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import {ISwapModeV2Router} from "./Interfaces.sol";
import {RouterIntentEoaAdapterWithoutDataProvider, EoaExecutorWithoutDataProvider} from "@routerprotocol/intents-core/contracts/RouterIntentEoaAdapter.sol";
import {Errors} from "@routerprotocol/intents-core/contracts/utils/Errors.sol";
import {IERC20, SafeERC20} from "../../../utils/SafeERC20.sol";

/**
 * @title SwapModeV2Mint
 * @author Shivam Agrawal (shivam78288)
 * @notice Adding liquidity on SwapMode V2 Pools.
 */

contract SwapModeV2Mint is RouterIntentEoaAdapterWithoutDataProvider {
    using SafeERC20 for IERC20;

    ISwapModeV2Router public immutable swapModeV2Router;

    constructor(
        address __native,
        address __wnative,
        address __swapModeRouter
    )
        RouterIntentEoaAdapterWithoutDataProvider(__native, __wnative)
    // solhint-disable-next-line no-empty-blocks
    {
        swapModeV2Router = ISwapModeV2Router(__swapModeRouter);
    }

    function name() public pure override returns (string memory) {
        return "SwapModeV2Mint";
    }

    /**
     * @inheritdoc EoaExecutorWithoutDataProvider
     */
    function execute(
        bytes calldata data
    ) external payable override returns (address[] memory tokens) {
        ISwapModeV2Router.SwapModeV2SupplyData memory mintParams = parseInputs(
            data
        );

        // If the adapter is called using `call` and not `delegatecall`
        if (address(this) == self()) {
            if (mintParams.tokenA != native())
                IERC20(mintParams.tokenA).safeTransferFrom(
                    msg.sender,
                    self(),
                    mintParams.amountADesired
                );
            else
                require(
                    msg.value == mintParams.amountADesired,
                    Errors.INSUFFICIENT_NATIVE_FUNDS_PASSED
                );

            if (mintParams.tokenB != native())
                IERC20(mintParams.tokenB).safeTransferFrom(
                    msg.sender,
                    self(),
                    mintParams.amountBDesired
                );
            else
                require(
                    msg.value == mintParams.amountBDesired,
                    Errors.INSUFFICIENT_NATIVE_FUNDS_PASSED
                );
        } else {
            if (mintParams.amountADesired == type(uint256).max)
                mintParams.amountADesired = getBalance(
                    mintParams.tokenA,
                    address(this)
                );

            if (mintParams.amountBDesired == type(uint256).max)
                mintParams.amountBDesired = getBalance(
                    mintParams.tokenB,
                    address(this)
                );
        }

        if (mintParams.tokenA == native()) {
            convertNativeToWnative(mintParams.amountADesired);
            mintParams.tokenA = wnative();
        }

        if (mintParams.tokenB == native()) {
            convertNativeToWnative(mintParams.amountBDesired);
            mintParams.tokenB = wnative();
        }

        IERC20(mintParams.tokenA).safeIncreaseAllowance(
            address(swapModeV2Router),
            mintParams.amountADesired
        );

        IERC20(mintParams.tokenB).safeIncreaseAllowance(
            address(swapModeV2Router),
            mintParams.amountBDesired
        );

        (uint256 amountA, uint256 amountB, uint256 liqAmount) = _mint(
            mintParams
        );

        bytes memory logData = abi.encode(
            mintParams,
            amountA,
            amountB,
            liqAmount
        );

        tokens = new address[](2);
        tokens[0] = mintParams.tokenA;
        tokens[1] = mintParams.tokenB;

        emit ExecutionEvent(name(), logData);
        return tokens;
    }

    //////////////////////////// ACTION LOGIC ////////////////////////////

    function _mint(
        ISwapModeV2Router.SwapModeV2SupplyData memory _mintParams
    ) internal returns (uint256 amountA, uint256 amountB, uint256 liqAmount) {
        (amountA, amountB, liqAmount) = swapModeV2Router.addLiquidity(
            _mintParams.tokenA,
            _mintParams.tokenB,
            _mintParams.amountADesired,
            _mintParams.amountBDesired,
            _mintParams.amountAMin,
            _mintParams.amountBMin,
            _mintParams.to,
            _mintParams.deadline
        );
    }

    /**
     * @dev function to parse input data.
     * @param data input data.
     */
    function parseInputs(
        bytes memory data
    ) public pure returns (ISwapModeV2Router.SwapModeV2SupplyData memory) {
        return abi.decode(data, (ISwapModeV2Router.SwapModeV2SupplyData));
    }

    // solhint-disable-next-line no-empty-blocks
    receive() external payable {}
}
