// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

interface IMetaPoolStakeEth {
    function depositETH(address _receiver) external payable returns (uint256);
}
