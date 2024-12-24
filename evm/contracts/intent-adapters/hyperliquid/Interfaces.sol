// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

interface IHyperliquidBridge {

    struct Signature {
        uint256 r;
        uint256 s;
        uint8 v;
    }

    struct DepositWithPermit {
        address user;
        uint64 usd;
        uint64 deadline;
        Signature signature;
    }

    function batchedDepositWithPermit(
        DepositWithPermit[] memory deposits
    ) external;
}
