// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.18;

/**
 * @title Errors library
 * @author Router Intents Error
 * @notice Defines the error messages emitted by the contracts on Router Intents
 */
library Errors {
    string public constant ARRAY_LENGTH_MISMATCH = "1"; // 'Array lengths mismatch'
    string public constant INSUFFICIENT_NATIVE_FUNDS_PASSED = "2"; // 'Insufficient native tokens passed'
    string public constant WRONG_BATCH_PROVIDED = "3"; // 'The targetLength, valueLength, callTypeLength, funcLength do not match in executeBatch transaction functions in batch transaction contract'
    string public constant INVALID_CALL_TYPE = "4"; // 'The callType value can only be 1 (call)' and 2(delegatecall)'
    string public constant ONLY_NITRO = "5"; // 'Only nitro can call this function'
    string public constant ONLY_SELF = "6"; // 'Only the current contract can call this function'
    string public constant ADAPTER_NOT_WHITELISTED = "7"; // 'Adapter not whitelisted'
    string public constant INVALID_BRIDGE_ADDRESS = "8"; // 'Bridge address neither asset forwarder nor dexspan'
    string public constant BRIDGE_CALL_FAILED = "9"; // 'Bridge call failed'
    string public constant INVALID_BRDIGE_TX_TYPE = "10"; // 'Bridge tx type cannot be greater than 3'
    string public constant INVALID_AMOUNT = "11"; // 'Amount is invalid'
    string public constant INVALID_BRIDGE_CHAIN_ID = "12"; // 'Bridging chainId is invalid'
    string public constant ZERO_AMOUNT_RECEIVED = "13"; // 'Zero amount received'
    string public constant INVALID_TX_TYPE = "14"; // 'Invalid txType value'
    string public constant INVALID_REQUEST = "15"; // 'Invalid Request'
    string public constant INVALID_ASSET_BRDIGE_TX_TYPE = "16"; // 'Asset Bridge tx type cannot be greater than 1'
    string public constant FEE_EXCEEDS_MAX_BIPS = "17"; // 'Fee passed exceeds max bips fee'
    string public constant FEE_RECIPIENT_CANNOT_BE_ZERO_ADDRESS = "18"; // 'Fee recipient cannot be address(0)'
}
