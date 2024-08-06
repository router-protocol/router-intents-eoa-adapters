// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import "./Interfaces/ITokenOracle.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

contract TokenOracle is ITokenOracle, AccessControl {
    bytes32 public constant SETTER_ROLE = keccak256("SETTER_ROLE");

    address public immutable baseToken;
    address public immutable quoteToken;
   
    // price -> price of stone * 1e18 / price of ETH  
    uint256 public tokenPrice;
    uint256 public lastUpdatedBlock;

    event PriceUpdated(uint256 newPrice, uint256 blockNumber);

    constructor(address _baseToken, address _quoteToken) {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(SETTER_ROLE, msg.sender);
        baseToken = _baseToken;
        quoteToken = _quoteToken;
    }

    function setTokenPrice(uint256 _price) external onlyRole(SETTER_ROLE) {
        tokenPrice = _price;
        lastUpdatedBlock = block.number;
        emit PriceUpdated(_price, block.number);
    }

    function getTokenPrice() external view returns (uint256) {
        return tokenPrice;
    }

    function getTokenPriceWithBlock() external view returns (uint256, uint256) {
        return (tokenPrice, lastUpdatedBlock);
    }
}
