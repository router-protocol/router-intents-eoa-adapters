// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

interface ITokenOracle {
    function getTokenPrice() external view returns (uint256);
    function setTokenPrice(uint256 _price) external;
    function getTokenPriceWithBlock() external view returns (uint256, uint256);
}