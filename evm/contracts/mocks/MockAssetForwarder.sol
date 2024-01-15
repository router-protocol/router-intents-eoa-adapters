// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import {IERC20, SafeERC20} from "../utils/SafeERC20.sol";
import {IAssetForwarder} from "../interfaces/IAssetForwarder.sol";
import {NitroMessageHandler} from "router-intents/contracts/utils/NitroMessageHandler.sol";

contract MockAssetForwarder {
    using SafeERC20 for IERC20;
    address public constant ETH = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

    error InvalidAmount();
    error ExecutionFailed();

    function iDeposit(
        IAssetForwarder.DepositData memory depositData,
        bytes memory destToken,
        bytes memory recipient
    ) external payable {
        if (depositData.srcToken != ETH) {
            IERC20(depositData.srcToken).safeTransferFrom(
                msg.sender,
                address(this),
                depositData.amount
            );
        } else {
            if (msg.value != depositData.amount) {
                revert InvalidAmount();
            }
        }
    }

    function iDepositMessage(
        IAssetForwarder.DepositData memory depositData,
        bytes memory destToken,
        bytes memory recipient,
        bytes memory message
    ) external payable {
        if (depositData.srcToken != ETH) {
            IERC20(depositData.srcToken).safeTransferFrom(
                msg.sender,
                address(this),
                depositData.amount
            );
        } else {
            if (msg.value != depositData.amount) {
                revert InvalidAmount();
            }
        }
    }

    function handleMessage(
        address tokenSent,
        uint256 amount,
        bytes memory instruction,
        address recipient
    ) external payable {
        if (tokenSent != ETH) {
            IERC20(tokenSent).safeTransferFrom(msg.sender, recipient, amount);
        } else {
            if (msg.value != amount) {
                revert InvalidAmount();
            }
            payable(recipient).transfer(amount);
        }

        // solhint-disable-next-line avoid-low-level-calls
        (bool success, ) = recipient.call(
            abi.encodeWithSelector(
                NitroMessageHandler.handleMessage.selector,
                tokenSent,
                amount,
                instruction
            )
        );

        if (!success) {
            revert ExecutionFailed();
        }
    }
}
