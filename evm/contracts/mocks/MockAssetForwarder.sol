// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

import {IERC20, SafeERC20} from "../utils/SafeERC20.sol";

contract MockAssetForwarder {
    using SafeERC20 for IERC20;
    address public constant ETH = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

    error InvalidAmount();
    error ExecutionFailed();

    function iDeposit(
        uint256,
        bytes32,
        bytes calldata,
        address srcToken,
        uint256 amount,
        uint256,
        bytes calldata
    ) external payable {
        if (srcToken != ETH) {
            IERC20(srcToken).safeTransferFrom(
                msg.sender,
                address(this),
                amount
            );
        } else {
            if (msg.value != amount) {
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
            abi.encodeWithSelector(0xd00a2d5f, tokenSent, amount, instruction)
        );

        if (!success) {
            revert ExecutionFailed();
        }
    }
}
