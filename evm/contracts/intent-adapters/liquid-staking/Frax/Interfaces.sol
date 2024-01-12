// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

interface IFraxEthMinter {
    function submitAndDeposit(
        address recipient
    ) external payable returns (uint256 shares);

    function submitAndGive(address recipient) external payable;
}
