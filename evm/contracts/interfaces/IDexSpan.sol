// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import {IERC20} from "../utils/SafeERC20.sol";

interface IDexSpan {
    struct SwapParams {
        IERC20[] tokens;
        uint256 amount;
        uint256 minReturn;
        uint256[] flags;
        bytes[] dataTx;
        address recipient;
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
}
