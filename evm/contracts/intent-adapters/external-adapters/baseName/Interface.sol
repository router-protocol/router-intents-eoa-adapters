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

    struct ReverseRegisterRequest {
        /// @dev The reverse record to set.
        address addr;
        /// @dev The owner of the reverse node.
        address owner;
        /// @dev The resolver of the reverse node.
        address resolver;
        /// @dev The name to set for this address.
        string name;
    }

    struct Register {
        address _recipient;
        uint256 _amount; 
        bytes registeryData;
    }
    function register(RegisterRequest calldata request) external payable;

    function registerPrice(string memory name, uint256 duration) external view returns (uint256);

    function setNameForAddr(address addr, address owner, address resolver, string memory name) external returns (bytes32);
}

interface IBaseReverseRegisterRouter {

    struct ReverseRegisterRequest {
        /// @dev The reverse record to set.
        address addr;
        /// @dev The owner of the reverse node.
        address owner;
        /// @dev The resolver of the reverse node.
        uint256 resolver;
        /// @dev The name to set for this address.
        address name;
    }

    function setNameForAddr(address addr, address owner, address resolver, string memory name) external;
}

interface IBaseReverseResolver {

    function setAddr(
        bytes32 node,
        address a
    ) external;
}