// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.18;

interface ILayerBankCore {
    function supply(
        address gToken,
        uint256 underlyingAmount
    ) external payable returns (uint256);
}
