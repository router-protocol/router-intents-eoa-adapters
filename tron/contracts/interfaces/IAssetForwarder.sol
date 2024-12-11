// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

/// @title Interface for handler contracts that support deposits and deposit executions.
/// @author Router Protocol.
interface IAssetForwarder {
    event FundsDeposited(
        uint256 partnerId,
        uint256 amount,
        bytes32 destChainIdBytes,
        uint256 destAmount,
        uint256 depositId,
        address srcToken,
        address depositor,
        bytes recipient,
        bytes destToken
    );

    event iUSDCDeposited(
        uint256 partnerId,
        uint256 amount,
        bytes32 destChainIdBytes,
        uint256 usdcNonce,
        address srcToken,
        bytes32 recipient,
        address depositor
    );

    event FundsDepositedWithMessage(
        uint256 partnerId,
        uint256 amount,
        bytes32 destChainIdBytes,
        uint256 destAmount,
        uint256 depositId,
        address srcToken,
        bytes recipient,
        address depositor,
        bytes destToken,
        bytes message
    );
    event FundsPaid(bytes32 messageHash, address forwarder, uint256 nonce);

    event DepositInfoUpdate(
        address srcToken,
        uint256 feeAmount,
        uint256 depositId,
        uint256 eventNonce,
        bool initiatewithdrawal,
        address depositor
    );

    event FundsPaidWithMessage(
        bytes32 messageHash,
        address forwarder,
        uint256 nonce,
        bool execFlag,
        bytes execData
    );

    struct DestDetails {
        uint32 domainId;
        uint256 fee;
        bool isSet;
    }

    struct RelayData {
        uint256 amount;
        bytes32 srcChainId;
        uint256 depositId;
        address destToken;
        address recipient;
    }

    struct RelayDataMessage {
        uint256 amount;
        bytes32 srcChainId;
        uint256 depositId;
        address destToken;
        address recipient;
        bytes message;
    }

    struct DepositData {
        uint256 partnerId;
        uint256 amount;
        uint256 destAmount;
        address srcToken;
        address refundRecipient;
        bytes32 destChainIdBytes;
    }

    function iDepositUSDC(
        uint256 partnerId,
        bytes32 destChainIdBytes,
        bytes32 recipient,
        uint256 amount
    ) external payable;

    function iDeposit(
        DepositData memory depositData,
        bytes memory destToken,
        bytes memory recipient
    ) external payable;

    function iDepositInfoUpdate(
        address srcToken,
        uint256 feeAmount,
        uint256 depositId,
        bool initiatewithdrawal
    ) external payable;

    function iDepositMessage(
        DepositData memory depositData,
        bytes memory destToken,
        bytes memory recipient,
        bytes memory message
    ) external payable;

    function iRelay(RelayData memory relayData) external payable;

    function iRelayMessage(RelayDataMessage memory relayData) external payable;

    function usdc() external view returns (address);

    function destDetails(
        bytes32 destChainIdBytes
    ) external view returns (DestDetails memory);
}
