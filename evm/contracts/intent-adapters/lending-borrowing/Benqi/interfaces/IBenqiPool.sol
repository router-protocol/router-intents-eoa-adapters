// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.18;

interface IBenqiPool {
    function mint(uint mintAmount) external returns (uint);

    function mint() external payable;

    function borrow(uint borrowAmount) external returns (uint);
}
