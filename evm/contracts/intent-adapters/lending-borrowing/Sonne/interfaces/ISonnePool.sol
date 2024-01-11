// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.18;

interface ISonnePool {
    function mint(uint mintAmount) external returns (uint);

    function borrow(uint borrowAmount) external returns (uint);
}