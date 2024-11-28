// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import {ILoopingHookUniversalRouter} from "./Interfaces.sol";
import {RouterIntentEoaAdapterWithoutDataProvider, EoaExecutorWithoutDataProvider} from "@routerprotocol/intents-core/contracts/RouterIntentEoaAdapter.sol";
import {Errors} from "@routerprotocol/intents-core/contracts/utils/Errors.sol";
import {IERC20, SafeERC20} from "../../utils/SafeERC20.sol";

/**
 * @title InitOpenPosition
 * @author Yashika Goyal
 * @notice Opening a new position on INIT Capital.
 */
contract InitOpenPosition is RouterIntentEoaAdapterWithoutDataProvider {
    using SafeERC20 for IERC20;
    ILoopingHookUniversalRouter public immutable universalRouter;

    constructor(
        address __native,
        address __wnative,
        address __universalRouter
    )
        RouterIntentEoaAdapterWithoutDataProvider(__native, __wnative)
    // solhint-disable-next-line no-empty-blocks
    {
        universalRouter = ILoopingHookUniversalRouter(__universalRouter);
    }

    function name() public pure override returns (string memory) {
        return "InitOpenPosition";
    }

    /**
     * @inheritdoc EoaExecutorWithoutDataProvider
     */
    function execute(
        bytes calldata data
    ) external payable override returns (address[] memory tokens) {
        ILoopingHookUniversalRouter.MintParams memory mintParams = parseInputs(
            data
        );

        // If the adapter is called using `call` and not `delegatecall`
        if (address(this) == self()) {
            if (mintParams._tokenIn != native())
                IERC20(mintParams._tokenIn).safeTransferFrom(
                    msg.sender,
                    self(),
                    mintParams._amtIn
                );
            else
                require(
                    msg.value == mintParams._amtIn,
                    Errors.INSUFFICIENT_NATIVE_FUNDS_PASSED
                );
        } else {
            if (mintParams._amtIn == type(uint256).max)
                mintParams._amtIn = getBalance(
                    mintParams._tokenIn,
                    address(this)
                );
        }

        if (mintParams._tokenIn == native()) {
            convertNativeToWnative(mintParams._amtIn);
            mintParams._tokenIn = wnative();
        }

        IERC20(mintParams._tokenIn).safeIncreaseAllowance(
            address(universalRouter),
            mintParams._amtIn
        );

        bytes memory logData;

        (tokens, logData) = _mint(mintParams);

        emit ExecutionEvent(name(), logData);
        return tokens;
    }

    //////////////////////////// ACTION LOGIC ////////////////////////////

    function _mint(
        ILoopingHookUniversalRouter.MintParams memory mintParams
    ) internal returns (address[] memory tokens, bytes memory logData) {
        (uint posId, uint initPosId, uint amtOut) = universalRouter.openPos(
            mintParams._mode,
            mintParams._viewer,
            mintParams._tokenIn,
            mintParams._amtIn,
            mintParams._borrPool,
            mintParams._borrAmt,
            mintParams._collPool,
            mintParams._data,
            mintParams._minAmtOut
        );

        tokens = new address[](1);
        tokens[0] = mintParams._tokenIn;

        logData = abi.encode(mintParams, posId, initPosId, amtOut);
    }

    /**
     * @dev function to parse input data.
     * @param data input data.
     */
    function parseInputs(
        bytes memory data
    ) public pure returns (ILoopingHookUniversalRouter.MintParams memory) {
        return abi.decode(data, (ILoopingHookUniversalRouter.MintParams));
    }

    // solhint-disable-next-line no-empty-blocks
    receive() external payable {}
}
