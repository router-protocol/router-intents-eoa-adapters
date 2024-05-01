// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import {RouterIntentEoaAdapterWithoutDataProvider, EoaExecutorWithoutDataProvider} from "@routerprotocol/intents-core/contracts/RouterIntentEoaAdapter.sol";
import {IParifiOrderManager, Order, Transaction, IParifiForwarder, IParifiDataFabric} from "./Interfaces.sol";
import {IERC20, SafeERC20} from "../../../utils/SafeERC20.sol";
import {IERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import {Errors} from "../../../Errors.sol";

contract ParifiOpenPosition is RouterIntentEoaAdapterWithoutDataProvider {
    using SafeERC20 for IERC20;

    IParifiOrderManager public immutable parifiOrderManager;
    IParifiDataFabric public immutable parifiDataFabric;
    IParifiForwarder public immutable parifiForwarder;

    struct PermitParams {
        uint256 deadline;
        bytes32 r;
        bytes32 s;
        uint8 v;
    }

    constructor(
        address __native,
        address __wnative,
        address __parifiOrderManager,
        address __parifiDataFabric,
        address __parifiForwarder
    ) RouterIntentEoaAdapterWithoutDataProvider(__native, __wnative) {
        parifiOrderManager = IParifiOrderManager(__parifiOrderManager);
        parifiDataFabric = IParifiDataFabric(__parifiDataFabric);
        parifiForwarder = IParifiForwarder(__parifiForwarder);
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
        (
            Transaction memory transaction,
            PermitParams memory permitParams,
            bytes memory signature
        ) = parseInputs(data);

        if (transaction.toAddress != address(parifiOrderManager))
            revert("to address not order manager");

        Order memory order = abi.decode(slice(transaction.txData, 4), (Order));

        address token = parifiDataFabric.getDepositToken(order.marketId);
        uint256 amount = order.deltaCollateral;

        if (uint8(order.orderType) != 0) revert("order type != 0");

        // Not adding if amount == max uint condition because the permit will only
        // work for the amount that was passed actually in the order object
        if (address(this) == self())
            IERC20(token).safeTransferFrom(msg.sender, self(), amount);

        bytes memory logData;

        (tokens, logData) = _openNewPosition(
            token,
            amount,
            transaction,
            permitParams,
            signature
        );

        emit ExecutionEvent(name(), logData);
        return tokens;
    }

    //////////////////////////// ACTION LOGIC ////////////////////////////

    function _openNewPosition(
        address token,
        uint256 amount,
        Transaction memory transaction,
        PermitParams memory permitParams,
        bytes memory signature
    ) internal returns (address[] memory tokens, bytes memory logData) {
        IERC20Permit(token).permit(
            transaction.fromAddress,
            address(parifiOrderManager),
            amount,
            permitParams.deadline,
            permitParams.v,
            permitParams.r,
            permitParams.s
        );

        IERC20(token).safeTransfer(transaction.fromAddress, amount);

        (bool success, ) = parifiForwarder.execute(
            transaction,
            signature,
            token
        );

        if (!success) revert("parifi order failed");

        tokens = new address[](1);
        tokens[0] = token;

        logData = abi.encode(token, amount);
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
        returns (Transaction memory, PermitParams memory, bytes memory)
    {
        return abi.decode(data, (Transaction, PermitParams, bytes));
    }

    // solhint-disable-next-line no-empty-blocks
    receive() external payable {}

    function slice(
        bytes memory _bytes,
        uint256 _start
    ) public pure returns (bytes memory) {
        require(_bytes.length >= _start, "Invalid slice length");

        uint256 _length = _bytes.length - _start;
        bytes memory sliced = new bytes(_length);
        assembly {
            // Get the data length of the original bytes array
            let len := mload(_bytes)
            // Ensure the slice won't go out of bounds
            if gt(len, add(_start, _length)) {
                revert(0, 0)
            }
            // Calculate the memory pointers for the start of the slice and the source data
            let src := add(add(_bytes, 0x20), _start)
            let dest := add(sliced, 0x20)
            // Copy _length bytes from source to destination
            for {
                let i := 0
            } lt(i, _length) {
                i := add(i, 1)
            } {
                mstore(add(dest, i), mload(add(src, i)))
            }
            // Set the length of the sliced bytes array
            mstore(sliced, _length)
        }
        return sliced;
    }
}
