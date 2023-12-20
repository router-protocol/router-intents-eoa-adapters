// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

import {AaveV3Helpers} from "./AaveV3Helpers.sol";
import {RouterIntentAdapter, Errors} from "router-intents/contracts/RouterIntentAdapter.sol";
import {NitroMessageHandler} from "router-intents/contracts/NitroMessageHandler.sol";
import {DefaultRefundable} from "router-intents/contracts/DefaultRefundable.sol";
import {IERC20, SafeERC20} from "../../../utils/SafeERC20.sol";

/**
 * @title AaveV3Borrow
 * @author Shivam Agrawal
 * @notice Borrowing funds on AaveV3.
 */
contract AaveV3Borrow is
    RouterIntentAdapter,
    NitroMessageHandler,
    DefaultRefundable,
    AaveV3Helpers
{
    using SafeERC20 for IERC20;

    constructor(
        address __native,
        address __wnative,
        address __owner,
        address __assetForwarder,
        address __dexspan,
        address __defaultRefundAddress,
        address __aaveV3Pool,
        address __aaveV3WrappedTokenGateway,
        uint16 __aaveV3ReferralCode
    )
        RouterIntentAdapter(__native, __wnative, __owner)
        NitroMessageHandler(__assetForwarder, __dexspan)
        DefaultRefundable(__defaultRefundAddress)
        AaveV3Helpers(
            __aaveV3Pool,
            __aaveV3WrappedTokenGateway,
            __aaveV3ReferralCode
        )
    // solhint-disable-next-line no-empty-blocks
    {

    }

    function name() public pure override returns (string memory) {
        return "AaveV3Borrow";
    }

    /**
     * @inheritdoc RouterIntentAdapter
     */
    function execute(
        address,
        address,
        bytes calldata data
    ) external payable override returns (address[] memory tokens) {
        (
            uint256 amount,
            uint256 rateMode,
            address asset,
            address onBehalfOf,
            address recipient
        ) = parseInputs(data);

        bytes memory logData;

        (tokens, logData) = _aaveV3Borrow(
            amount,
            rateMode,
            asset,
            onBehalfOf,
            recipient
        );

        emit ExecutionEvent(name(), logData);
        return tokens;
    }

    //////////////////////////// ACTION LOGIC ////////////////////////////

    /**
     * @notice function to borrow funds from AaveV3.
     * @param amount Amount of asset to be borrowed.
     * @param rateMode Rate mode for borrowing. 1 for Stable Rate and 2 for Variable Rate
     * @param asset Asset to be borrowed.
     * @param onBehalfOf The user who will incur the borrow.
     */
    function _aaveV3Borrow(
        uint256 amount,
        uint256 rateMode,
        address asset,
        address onBehalfOf,
        address recipient
    ) private returns (address[] memory tokens, bytes memory logData) {
        aaveV3Pool().borrow(
            asset,
            amount,
            rateMode,
            aaveV3ReferralCode(),
            onBehalfOf
        );

        withdrawTokens(asset, recipient, amount);

        tokens = new address[](1);
        tokens[0] = asset;

        logData = abi.encode(amount, rateMode, asset, onBehalfOf);
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

    /**
     * @dev function to parse input data.
     * @param data input data.
     */
    function parseInputs(
        bytes memory data
    ) public pure returns (uint256, uint256, address, address, address) {
        return abi.decode(data, (uint256, uint256, address, address, address));
    }

    // solhint-disable-next-line no-empty-blocks
    receive() external payable {}
}
