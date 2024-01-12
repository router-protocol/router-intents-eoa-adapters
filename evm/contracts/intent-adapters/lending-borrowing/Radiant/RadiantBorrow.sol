// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

import {RadiantHelpers} from "./RadiantHelpers.sol";
import {RouterIntentEoaAdapter, EoaExecutor} from "router-intents/contracts/RouterIntentEoaAdapter.sol";
import {Errors} from "../../../Errors.sol";
import {DefaultRefundable} from "router-intents/contracts/utils/DefaultRefundable.sol";
import {IERC20, SafeERC20} from "../../../utils/SafeERC20.sol";

/**
 * @title RadiantBorrow
 * @author Yashika Goyal
 * @notice Borrowing funds on Radiant.
 */
contract RadiantBorrow is RouterIntentEoaAdapter, RadiantHelpers {
    using SafeERC20 for IERC20;

    constructor(
        address __native,
        address __wnative,
        address __radiantPool,
        address __radiantWrappedTokenGateway,
        uint16 __radiantReferralCode
    )
        RouterIntentEoaAdapter(__native, __wnative, false, address(0))
        RadiantHelpers(
            __radiantPool,
            __radiantWrappedTokenGateway,
            __radiantReferralCode
        )
    // solhint-disable-next-line no-empty-blocks
    {

    }

    function name() public pure override returns (string memory) {
        return "RadiantBorrow";
    }

    /**
     * @inheritdoc EoaExecutor
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

        (tokens, logData) = _radiantBorrow(
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
     * @notice function to borrow funds from Radiant.
     * @param amount Amount of asset to be borrowed.
     * @param rateMode Rate mode for borrowing. 1 for Stable Rate and 2 for Variable Rate
     * @param asset Asset to be borrowed.
     * @param onBehalfOf The user who will incur the borrow.
     */
    function _radiantBorrow(
        uint256 amount,
        uint256 rateMode,
        address asset,
        address onBehalfOf,
        address recipient
    ) private returns (address[] memory tokens, bytes memory logData) {
        radiantPool.borrow(
            asset,
            amount,
            rateMode,
            radiantReferralCode,
            onBehalfOf
        );

        withdrawTokens(asset, recipient, amount);

        tokens = new address[](1);
        tokens[0] = asset;

        logData = abi.encode(amount, rateMode, asset, onBehalfOf);
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
