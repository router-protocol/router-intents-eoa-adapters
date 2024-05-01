// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import {IERC20} from "../utils/SafeERC20.sol";

interface IDexSpan {
    struct SameChainSwapParams {
        IERC20[] tokens;
        uint256 widgetId;
        uint256 amount;
        uint256 minReturn;
        uint256[] flags;
        bytes[] dataTx;
        address recipient;
    }

    struct SwapParams {
        IERC20[] tokens;
        uint256 amount;
        uint256 minReturn;
        uint256[] flags;
        bytes[] dataTx;
        bool isWrapper;
        address recipient;
        bytes destToken;
    }

    function swapInSameChain(
        IERC20[] memory tokens,
        uint256 amount,
        uint256 minReturn,
        uint256[] memory flags,
        bytes[] memory dataTx,
        bool isWrapper,
        address recipient,
        uint256 widgetID
    ) external payable returns (uint256 returnAmount);

    function swapAndDeposit(
        uint256 partnerId,
        bytes32 destChainIdBytes,
        bytes calldata recipient,
        uint8 depositType,
        uint256 feeAmount,
        bytes memory message,
        SwapParams memory swapData,
        address refundRecipient
    ) external payable;
}
