// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {IWETH} from "../../../interfaces/IWETH.sol";

interface IBaseRegisterRouter {

    struct RegisterRequest {
        /// @dev The name being registered.
        string name;
        /// @dev The address of the owner for the name.
        address owner;
        /// @dev The duration of the registration in seconds.
        uint256 duration;
        /// @dev The address of the resolver to set for this name.
        address resolver;
        /// @dev Multicallable data bytes for setting records in the associated resolver upon reigstration.
        bytes[] data;
        /// @dev Bool to decide whether to set this name as the "primary" name for the `owner`.
        bool reverseRecord;
    }

    struct Register {
        address _recipient;
        uint256 _amount; 
        bytes registeryData;
    }
    function register(RegisterRequest calldata request) external payable;

    function registerPrice(string memory name, uint256 duration) external view returns (uint256);
}