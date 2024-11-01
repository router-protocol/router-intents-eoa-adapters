// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import {IRingSwapRouter} from "./Interfaces.sol";
import {RouterIntentEoaAdapterWithoutDataProvider, EoaExecutorWithoutDataProvider} from "@routerprotocol/intents-core/contracts/RouterIntentEoaAdapter.sol";
import {Errors} from "@routerprotocol/intents-core/contracts/utils/Errors.sol";
import {IERC20, SafeERC20} from "../../../utils/SafeERC20.sol";

/**
 * @title RingMint
 * @author Yashika Goyal
 * @notice Adding Liquidity on Ring.
 */
contract RingMint is RouterIntentEoaAdapterWithoutDataProvider {
    using SafeERC20 for IERC20;
    IRingSwapRouter
        public immutable swapRouter;

    constructor(
        address __native,
        address __wnative,
        address __swapRouter
    )
        RouterIntentEoaAdapterWithoutDataProvider(__native, __wnative)
    // solhint-disable-next-line no-empty-blocks
    {
        swapRouter = IRingSwapRouter(
            __swapRouter
        );
    }

    function name() public pure override returns (string memory) {
        return "RingMint";
    }

    /**
     * @inheritdoc EoaExecutorWithoutDataProvider
     */
    function execute(
        bytes calldata data
    ) external payable override returns (address[] memory tokens) {
        IRingSwapRouter.RingSupplyData
            memory mintParams = parseInputs(data);

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
            address(swapRouter),
            mintParams.amountADesired
        );

        IERC20(mintParams.tokenB).safeIncreaseAllowance(
            address(swapRouter),
            mintParams.amountBDesired
        );

        bytes memory logData;

        (tokens, logData) = _mint(mintParams);

        emit ExecutionEvent(name(), logData);
        return tokens;
    }

    //////////////////////////// ACTION LOGIC ////////////////////////////

    function _mint(
        IRingSwapRouter.RingSupplyData memory mintParams
    ) internal returns (address[] memory tokens, bytes memory logData) {
        (uint amountA, uint amountB, uint liqAmount) = swapRouter.addLiquidity(
                mintParams.tokenA,
                mintParams.tokenB,
                mintParams.amountADesired,
                mintParams.amountBDesired,
                mintParams.amountAMin,
                mintParams.amountBMin,
                mintParams.to,
                mintParams.deadline
            );

        tokens = new address[](2);
        tokens[0] = mintParams.tokenA;
        tokens[1] = mintParams.tokenB;

        logData = abi.encode(mintParams, amountA, amountB, liqAmount);
    }

    /**
     * @dev function to parse input data.
     * @param data input data.
     */
    function parseInputs(
        bytes memory data
    )
        public
        pure
        returns (IRingSwapRouter.RingSupplyData memory)
    {
        return
            abi.decode(
                data,
                (IRingSwapRouter.RingSupplyData)
            );
    }

    // solhint-disable-next-line no-empty-blocks
    receive() external payable {}
}
