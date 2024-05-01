// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

enum OrderType {
    OPEN_NEW_POSITION, // Open a new position
    CLOSE_POSITION, // Close an existing position
    INCREASE_POSITION, // Increase position by adding more collateral and/or increasing position size
    DECREASE_POSITION // Decrease position by removing collateral and/or decreasing position size
}

struct Transaction {
    address fromAddress;
    address toAddress;
    uint256 txValue;
    uint256 minGas;
    uint256 maxGasPrice;
    uint256 userNonce;
    uint256 txDeadline;
    bytes txData;
}

struct Order {
    bytes32 marketId; // keccak256 hash of asset symbol + vaultAddress
    address userAddress; // User that signed/submitted the order
    OrderType orderType; // Refer enum OrderType
    bool isLong; // Set to true if it is a Long order, false for a Short order
    bool isLimitOrder; // Flag to identify limit orders
    bool triggerAbove; // Flag to trigger price above or below expectedPrice
    uint256 deadline; // Timestamp after which order cannot be executed
    uint256 deltaCollateral; // Change in collateral amount (increased/decreased)
    uint256 deltaSize; // Change in Order size (increased/decreased)
    uint256 expectedPrice; // Desired Value for order execution
    uint256 maxSlippage; // Maximum allowed slippage in executionPrice from expectedPrice (in basis points)
    address partnerAddress; // Address that receives referral fees for new position orders (a share of opening fee)
}

interface IParifiOrderManager {
    function createNewPosition(Order memory _order) external;

    function getOrderIdForUser(
        address userAddress
    ) external view returns (bytes32 orderId);

    function getPendingOrder(
        bytes32 orderId
    ) external view returns (Order memory orderDetails);
}

interface IParifiDataFabric {
    function getDepositToken(bytes32 marketId) external view returns (address);
}

interface IParifiForwarder {
    function execute(
        Transaction calldata transaction,
        bytes calldata signature,
        address feeToken
    ) external payable returns (bool, bytes memory);

    function verify(
        Transaction calldata transaction,
        bytes calldata signature
    ) external view returns (bool);
}
