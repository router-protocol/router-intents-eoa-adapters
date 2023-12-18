// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

import {IDexSpan} from "../../interfaces/IDexSpan.sol";
import {RouterIntentAdapter, NitroMessageHandler, Errors} from "router-intents/contracts/RouterIntentAdapter.sol";
import {IERC20, SafeERC20} from "../../utils/SafeERC20.sol";

/**
 * @title DexSpanAdapter
 * @author Shivam Agrawal
 * @notice Swapping tokens using DexSpan contract
 */
contract DexSpanAdapter is RouterIntentAdapter {
    using SafeERC20 for IERC20;

    constructor(
        address __native,
        address __wnative,
        address __assetForwarder,
        address __dexspan,
        address __defaultRefundAddress,
        address __owner
    )
        RouterIntentAdapter(
            __native,
            __wnative,
            __assetForwarder,
            __dexspan,
            __defaultRefundAddress,
            __owner
        )
    // solhint-disable-next-line no-empty-blocks
    {

    }

    function name() public pure override returns (string memory) {
        return "DexSpanAdapter";
    }

    /**
     * @inheritdoc RouterIntentAdapter
     */
    function execute(
        address,
        address,
        bytes calldata data
    ) external payable override returns (address[] memory tokens) {
        IDexSpan.SwapParams memory swapData = parseInputs(data);

        // If the adapter is called using `call` and not `delegatecall`
        if (address(this) == self()) {
            if (address(swapData.tokens[0]) != native())
                swapData.tokens[0].safeTransferFrom(
                    msg.sender,
                    self(),
                    swapData.amount
                );
            else
                require(
                    msg.value == swapData.amount,
                    Errors.INSUFFICIENT_NATIVE_FUNDS_PASSED
                );
        }

        bytes memory logData;

        (tokens, logData) = _swap(swapData);

        emit ExecutionEvent(name(), logData);
        return tokens;
    }

    /**
     * @inheritdoc NitroMessageHandler
     */
    function handleMessage(
        address tokenSent,
        uint256 amount,
        bytes memory
    ) external override onlyNitro nonReentrant {
        withdrawTokens(tokenSent, defaultRefundAddress(), amount);
        emit UnsupportedOperation(tokenSent, defaultRefundAddress(), amount);
    }

    //////////////////////////// ACTION LOGIC ////////////////////////////

    function _swap(
        IDexSpan.SwapParams memory _swapData
    ) internal returns (address[] memory tokens, bytes memory logData) {
        withdrawTokens(
            address(_swapData.tokens[0]),
            dexspan(),
            _swapData.amount
        );

        IDexSpan(dexspan()).swapInSameChain(
            _swapData.tokens,
            _swapData.amount,
            _swapData.minReturn,
            _swapData.flags,
            _swapData.dataTx,
            true,
            _swapData.recipient,
            0
        );

        tokens = new address[](2);
        tokens[0] = address(_swapData.tokens[0]);
        tokens[1] = address(_swapData.tokens[_swapData.tokens.length - 1]);

        logData = abi.encode(_swapData.tokens, _swapData.amount);
    }

    /**
     * @dev function to parse input data.
     * @param data input data.
     */
    function parseInputs(
        bytes memory data
    ) public pure returns (IDexSpan.SwapParams memory swapData) {
        swapData = abi.decode(data, (IDexSpan.SwapParams));
    }
}
