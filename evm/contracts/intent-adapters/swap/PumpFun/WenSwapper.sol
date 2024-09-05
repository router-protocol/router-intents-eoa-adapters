// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import {IWenSwapper} from "./Interfaces/IWenSwapper.sol";
import {IWenToken} from "./Interfaces/IWenToken.sol";
import {RouterIntentEoaAdapterWithoutDataProvider, EoaExecutorWithoutDataProvider} from "@routerprotocol/intents-core/contracts/RouterIntentEoaAdapter.sol";
import {Errors} from "@routerprotocol/intents-core/contracts/utils/Errors.sol";
import {IERC20, SafeERC20} from "../../../utils/SafeERC20.sol";

/**
 * @title WenSwapper
 * @author Yashika Goyal
 * @notice Swapping tokens using Pump Fun Protocol.
 */
contract WenSwapper is RouterIntentEoaAdapterWithoutDataProvider {
    using SafeERC20 for IERC20;

    IWenSwapper public immutable wenSwapper;
    
    error InvalidTxType();

    constructor(
        address __native,
        address __wnative,
        address __wenFoundry
    )
        RouterIntentEoaAdapterWithoutDataProvider(__native, __wnative)
    // solhint-disable-next-line no-empty-blocks
    {
        wenSwapper = IWenSwapper(__wenFoundry);
    }

    function name() public pure override returns (string memory) {
        return "WenSwapper";
    }

    /**
     * @inheritdoc EoaExecutorWithoutDataProvider
     */
    function execute(
        bytes calldata data
    ) external payable override returns (address[] memory tokens) {
        IWenSwapper.WenSwapParams memory swapParams = parseInputs(data);

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

            if (swapParams.amountIn == type(uint256).max)
                swapParams.amountIn = getBalance(native(), address(this));
        }
        if (swapParams.tokenIn != native()) {
            IERC20(swapParams.tokenIn).safeIncreaseAllowance(
                address(wenSwapper),
                swapParams.amountIn
            );
        }

        bytes memory logData;

        (tokens, logData) = _mint(swapParams);

        emit ExecutionEvent(name(), logData);
        return tokens;
    }

    //////////////////////////// ACTION LOGIC ////////////////////////////

    function _mint(
        IWenSwapper.WenSwapParams memory swapParams
    ) internal returns (address[] memory tokens, bytes memory logData) {
        uint256 amountOut;

        if (swapParams.txType == 1) {
            amountOut = wenSwapper.swapEthForTokens{
                value: swapParams.amountIn
            }(
                IWenToken(swapParams.tokenOut),
                swapParams.amountIn,
                swapParams.amountOutMin,
                swapParams.to,
                swapParams.deadline
            );
        } else if (swapParams.txType == 2) {
            amountOut = wenSwapper.swapTokensForEth(
                IWenToken(swapParams.tokenIn),
                swapParams.amountIn,
                swapParams.amountOutMin,
                swapParams.to,
                swapParams.deadline
            );
        } else {
            revert InvalidTxType();
        }

        tokens = new address[](2);
        tokens[0] = swapParams.tokenIn;
        tokens[1] = swapParams.tokenOut;

        logData = abi.encode(swapParams, amountOut);
    }

    /**
     * @dev function to parse input data.
     * @param data input data.
     */
    function parseInputs(
        bytes memory data
    ) public pure returns (IWenSwapper.WenSwapParams memory) {
        return abi.decode(data, (IWenSwapper.WenSwapParams));
    }

    // solhint-disable-next-line no-empty-blocks
    receive() external payable {}
}
