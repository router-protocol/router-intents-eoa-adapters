// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

interface IStaderPool {
    function deposit(address receiver) external payable returns (uint256);

    function swapMaticForMaticXViaInstantPool() external payable;
}

interface IMaticX {
    function submit(uint256 _amount) external returns (uint256);
}

interface IStakeManager {
    function deposit() external payable;
}
