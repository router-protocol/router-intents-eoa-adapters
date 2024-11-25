// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import {ILucidSwapRouter} from "./Interfaces.sol";
import {RouterIntentEoaAdapterWithoutDataProvider, EoaExecutorWithoutDataProvider} from "@routerprotocol/intents-core/contracts/RouterIntentEoaAdapter.sol";
import {Errors} from "@routerprotocol/intents-core/contracts/utils/Errors.sol";
import {IERC20, SafeERC20} from "../../utils/SafeERC20.sol";

/**
 * @title LucidSwapper
 * @author Yashika Goyal
 * @notice Swapping tokens for Lucid.
 */
contract LucidSwapper is
    RouterIntentEoaAdapterWithoutDataProvider
{
    using SafeERC20 for IERC20;
    
    ILucidSwapRouter public immutable swapRouter;

    constructor(
        address __native,
        address __wnative,
        address __swapRouter
    )
        RouterIntentEoaAdapterWithoutDataProvider(__native, __wnative)
    // solhint-disable-next-line no-empty-blocks
    {
        swapRouter = ILucidSwapRouter(__swapRouter);
    }

    function name() public pure override returns (string memory) {
        return "LucidSwapper";
    }

    /**
     * @inheritdoc EoaExecutorWithoutDataProvider
     */
    function execute(
        bytes calldata data
    ) external payable override returns (address[] memory tokens) {
        ILucidSwapRouter.SwapParams
            memory swapParams = parseInputs(data);

        // If the adapter is called using `call` and not `delegatecall`
        if (address(this) == self()) {
            if (swapParams.tokenIn != native())
                IERC20(swapParams.tokenIn).safeTransferFrom(
                    msg.sender,
                    self(),
                    swapParams.amountIn
                );
            else
                require(
                    msg.value == swapParams.amountIn,
                    Errors.INSUFFICIENT_NATIVE_FUNDS_PASSED
                );
        } else {
            if (swapParams.amountIn == type(uint256).max)
                swapParams.amountIn = getBalance(
                    swapParams.tokenIn,
                    address(this)
                );
        }

        if (swapParams.tokenIn == native()) {
            convertNativeToWnative(swapParams.amountIn);
            swapParams.tokenIn = wnative();
        }

        IERC20(swapParams.tokenIn).safeIncreaseAllowance(
            address(swapRouter),
            swapParams.amountIn
        );

        bytes memory logData;

        (tokens, logData) = _mint(swapParams);

        emit ExecutionEvent(name(), logData);
        return tokens;
    }

    //////////////////////////// ACTION LOGIC ////////////////////////////

    function _mint(
        ILucidSwapRouter.SwapParams memory swapParams
    ) internal returns (address[] memory tokens, bytes memory logData) {
        uint[] memory amountsOut = swapRouter.swapExactTokensForTokens(
            swapParams.amountIn,
            swapParams.amountOutMin,
            swapParams.path,
            swapParams.to,
            swapParams.deadline
        );

        tokens = new address[](2);
        tokens[0] = swapParams.tokenIn;
        tokens[1] = swapParams.tokenOut;

        logData = abi.encode(swapParams, amountsOut);
    }

    /**
     * @dev function to parse input data.
     * @param data input data.
     */
    function parseInputs(
        bytes memory data
    ) public pure returns (ILucidSwapRouter.SwapParams memory) {
        return abi.decode(data, (ILucidSwapRouter.SwapParams));
    }

    // solhint-disable-next-line no-empty-blocks
    receive() external payable {}
}
