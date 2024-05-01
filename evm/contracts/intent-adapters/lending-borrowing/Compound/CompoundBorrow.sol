// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import {CompoundHelpers} from "./CompoundHelpers.sol";
import {IComet} from "./interfaces/IComet.sol";
import {RouterIntentEoaAdapterWithoutDataProvider, EoaExecutorWithoutDataProvider} from "@routerprotocol/intents-core/contracts/RouterIntentEoaAdapter.sol";
import {Errors} from "@routerprotocol/intents-core/contracts/utils/Errors.sol";
import {IERC20, SafeERC20} from "../../../utils/SafeERC20.sol";

/**
 * @title CompoundBorrow
 * @author Yashika Goyal
 * @notice Borrowing funds on Compound.
 */
contract CompoundBorrow is RouterIntentEoaAdapterWithoutDataProvider, CompoundHelpers {
    using SafeERC20 for IERC20;

    constructor(
        address __native,
        address __wnative,
        address __usdc,
        address __cUSDCV3Pool,
        address __cWETHV3Pool
    )
        RouterIntentEoaAdapterWithoutDataProvider(__native, __wnative)
        CompoundHelpers(__usdc, __cUSDCV3Pool, __cWETHV3Pool)
    // solhint-disable-next-line no-empty-blocks
    {

    }

    function name() public pure override returns (string memory) {
        return "CompoundBorrow";
    }

    /**
     * @inheritdoc EoaExecutorWithoutDataProvider
     */
    function execute(
        bytes calldata data
    ) external payable override returns (address[] memory tokens) {
        (
            uint256 amount,
            address asset,
            address onBehalfOf,
            address recipient
        ) = parseInputs(data);

        bytes memory logData;

        (tokens, logData) = _compoundBorrow(
            amount,
            asset,
            onBehalfOf,
            recipient
        );

        emit ExecutionEvent(name(), logData);
        return tokens;
    }

    //////////////////////////// ACTION LOGIC ////////////////////////////

    /**
     * @notice function to borrow funds from Compound.
     * @param amount Amount of asset to be borrowed.
     * @param asset Asset to be borrowed.
     * @param onBehalfOf The user who will incur the borrow.
     * @param recipient The address to send the withdrawn or borrowed asset.
     */
    function _compoundBorrow(
        uint256 amount,
        address asset,
        address onBehalfOf,
        address recipient
    ) private returns (address[] memory tokens, bytes memory logData) {
        IComet _cTokenV3Pool;
        if (asset == usdc) {
            _cTokenV3Pool = cUSDCV3Pool;
        } else if (asset == wnative()) {
            _cTokenV3Pool = cWETHV3Pool;
        } else revert InvalidBorrowMarket();

        _cTokenV3Pool.withdrawFrom(onBehalfOf, recipient, asset, amount);

        tokens = new address[](1);
        tokens[0] = asset;

        logData = abi.encode(amount, asset, onBehalfOf, recipient);
    }

    /**
     * @dev function to parse input data.
     * @param data input data.
     */
    function parseInputs(
        bytes memory data
    ) public pure returns (uint256, address, address, address) {
        return abi.decode(data, (uint256, address, address, address));
    }

    // solhint-disable-next-line no-empty-blocks
    receive() external payable {}
}
