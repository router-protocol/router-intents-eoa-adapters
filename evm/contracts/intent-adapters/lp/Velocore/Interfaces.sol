// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

interface IVelocoreVault {

    struct VelocoreSupplyData {
        address tokenA;
        address tokenB;
        address lpToken;
        address to;
        uint256 amountADesired;
        uint256 amountBDesired;
    }

    struct VelocoreOperation {
    bytes32 poolId;
    bytes32[] tokenInformations;
    bytes data;
    }

    type Token is bytes32;

    function execute(Token[] calldata tokenRef, int128[] memory deposit, VelocoreOperation[] calldata ops)
        external
        payable;
}