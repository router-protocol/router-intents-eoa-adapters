// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.18;

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
}
