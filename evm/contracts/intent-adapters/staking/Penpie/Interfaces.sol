// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

interface IMPendleConvertor {

    /// @notice deposit PENDLE in magpie finance and get mPENDLE at a 1:1 rate
    /// @param _amount the amount of pendle
    /// @param _mode 0 doing nothing, 1 is convert and stake
    function convert(
        address _for,
        uint256 _amount,
        uint256 _mode
    ) external;
}