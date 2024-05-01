// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import {LendleHelpers} from "./LendleHelpers.sol";
import {RouterIntentEoaAdapterWithoutDataProvider, EoaExecutorWithoutDataProvider} from "@routerprotocol/intents-core/contracts/RouterIntentEoaAdapter.sol";
import {Errors} from "@routerprotocol/intents-core/contracts/utils/Errors.sol";
import {IERC20, SafeERC20} from "../../../utils/SafeERC20.sol";

/**
 * @title LendleBorrow
 * @author Yashika Goyal
 * @notice Borrowing funds on Lendle.
 */
contract LendleBorrow is
    RouterIntentEoaAdapterWithoutDataProvider,
    LendleHelpers
{
    using SafeERC20 for IERC20;

    constructor(
        address __native,
        address __wnative,
        address __lendingPool,
        address __lendleWrappedTokenGateway,
        uint16 __lendleReferralCode
    )
        RouterIntentEoaAdapterWithoutDataProvider(__native, __wnative)
        LendleHelpers(
            __lendingPool,
            __lendleWrappedTokenGateway,
            __lendleReferralCode
        )
    // solhint-disable-next-line no-empty-blocks
    {

    }

    function name() public pure override returns (string memory) {
        return "LendleBorrow";
    }

    /**
     * @inheritdoc EoaExecutorWithoutDataProvider
     */
    function execute(
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

        (tokens, logData) = _lendleBorrow(
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
     * @notice function to borrow funds from Lendle.
     * @param amount Amount of asset to be borrowed.
     * @param rateMode Rate mode for borrowing. 1 for Stable Rate and 2 for Variable Rate
     * @param asset Asset to be borrowed.
     * @param onBehalfOf The user who will incur the borrow.
     */
    function _lendleBorrow(
        uint256 amount,
        uint256 rateMode,
        address asset,
        address onBehalfOf,
        address recipient
    ) private returns (address[] memory tokens, bytes memory logData) {
        lendingPool.borrow(
            asset,
            amount,
            rateMode,
            lendleReferralCode,
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
