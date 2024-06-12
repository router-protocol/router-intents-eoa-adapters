// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import {RouterIntentEoaAdapterWithoutDataProvider, EoaExecutorWithoutDataProvider} from "@routerprotocol/intents-core/contracts/RouterIntentEoaAdapter.sol";
import {IParifiOrderManager, Order, IParifiDataFabric} from "./Interfaces.sol";
import {IERC20, SafeERC20} from "../../../utils/SafeERC20.sol";

contract ParifiOpenPosition is RouterIntentEoaAdapterWithoutDataProvider {
    using SafeERC20 for IERC20;

    IParifiOrderManager public immutable parifiOrderManager;
    IParifiDataFabric public immutable parifiDataFabric;

    constructor(
        address __native,
        address __wnative,
        address __parifiOrderManager,
        address __parifiDataFabric
    ) RouterIntentEoaAdapterWithoutDataProvider(__native, __wnative) {
        parifiOrderManager = IParifiOrderManager(__parifiOrderManager);
        parifiDataFabric = IParifiDataFabric(__parifiDataFabric);
    }

    function name() public pure override returns (string memory) {
        return "ParifiOpenPosition";
    }

    /**
     * @inheritdoc EoaExecutorWithoutDataProvider
     */
    function execute(
        bytes calldata data
    ) external payable override returns (address[] memory tokens) {
        Order memory order = parseInputs(data);

        address token = parifiDataFabric.getDepositToken(order.marketId);

        if (uint8(order.orderType) != 0) revert("order type != 0");

        if (address(this) == self())
            IERC20(token).safeTransferFrom(
                msg.sender,
                self(),
                order.deltaCollateral
            );
        else if (order.deltaCollateral == type(uint256).max)
            order.deltaCollateral = IERC20(token).balanceOf(address(this));

        bytes memory logData;

        (tokens, logData) = _openNewPosition(
            token,
            order.deltaCollateral,
            order
        );

        emit ExecutionEvent(name(), logData);
        return tokens;
    }

    //////////////////////////// ACTION LOGIC ////////////////////////////

    function _openNewPosition(
        address token,
        uint256 amount,
        Order memory order
    ) internal returns (address[] memory tokens, bytes memory logData) {
        IERC20(token).safeIncreaseAllowance(
            address(parifiOrderManager),
            amount
        );

        parifiOrderManager.createNewPosition(order, true);

        tokens = new address[](1);
        tokens[0] = token;

        logData = abi.encode(token, amount);
    }

    /**
     * @dev function to parse input data.
     * @param data input data.
     */
    function parseInputs(bytes memory data) public pure returns (Order memory) {
        return abi.decode(data, (Order));
    }

    // solhint-disable-next-line no-empty-blocks
    receive() external payable {}
}
