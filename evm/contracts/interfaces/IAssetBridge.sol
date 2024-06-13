// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

/// @title Interface for Voyager contracts that support deposits and deposit executions.
/// @author Router Protocol.

interface IAssetBridge {
    event TokenTransfer(
        bytes32 indexed destChainIdBytes,
        address indexed srcTokenAddress,
        uint256 srcTokenAmount,
        bytes recipient,
        uint256 partnerId,
        uint256 depositId
    );

    event TokenTransferWithInstruction(
        bytes32 indexed destChainIdBytes,
        address indexed srcTokenAddress,
        uint256 srcTokenAmount,
        bytes recipient,
        uint256 partnerId,
        uint64 destGasLimit,
        bytes instruction,
        uint256 depositId
    );

    event DepositReverted(
        bytes32 indexed destChainIdBytes,
        uint256 indexed depositNonce,
        address indexed sender,
        address srcSettlementToken,
        uint256 srcSettlementAmount
    );

    event Execute(
        uint8 executeType,
        bytes32 indexed sourceChainIdBytes,
        uint256 indexed depositNonce,
        address settlementToken,
        uint256 settlementAmount,
        address recipient
    );

    event ExecuteWithMessage(
        uint8 executeType,
        bytes32 indexed sourceChainIdBytes,
        uint256 indexed depositNonce,
        address settlementToken,
        uint256 settlementAmount,
        address recipient,
        bool flag,
        bytes data
    );
    struct ExecuteInfo {
        address recipient;
        address destTokenAddress;
        uint256 destTokenAmount;
        uint256 depositNonce;
    }

    struct DepositData {
        address sender;
        address srcTokenAddress;
        uint256 srcTokenAmount;
        uint256 depositNonce;
    }

    struct TransferPayload {
        bytes32 destChainIdBytes;
        address srcTokenAddress;
        uint256 srcTokenAmount;
        bytes recipient;
        uint256 partnerId;
    }
    
    struct SwapTransferPayload {
        bytes32 destChainIdBytes;
        address[] tokens; // index 0 will be src token and index n-1 will be to address
        uint256[] flags;
        bytes[] dataTx;
        uint256 srcTokenAmount;
        uint256 minToAmount;
        bytes recipient;
        uint256 partnerId;
    }

    function transferTokenWithInstruction(
        TransferPayload memory transferPayload,
        uint64 destGasLimit,
        bytes calldata instruction
    ) external payable;

    function transferToken(TransferPayload memory transferPayload) external payable;

    function swapAndTransferToken(SwapTransferPayload memory transferPayload) external payable;

    function swapAndTransferTokenWithInstruction(
        SwapTransferPayload memory transferPayload,
        uint64 destGasLimit,
        bytes calldata instruction
    ) external payable;
}