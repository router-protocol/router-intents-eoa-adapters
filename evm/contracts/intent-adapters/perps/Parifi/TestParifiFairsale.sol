// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import {SafeERC20, IERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract TestParifiFairsale {
    using SafeERC20 for IERC20;
    /**
     * Event for token purchase/claim logging
     * @param purchaser who paid for the tokens
     * @param amount amount of USDC deposited
     */

    event TokensPurchased(address indexed purchaser, uint256 amount);
    event TokensClaimed(address indexed purchaser, uint256 amount);

    IERC20 public token;
    uint256 public crowdsaleTokenCap;
    uint256 public tokensPerUSD;
    uint256 public startDate;
    uint256 public endDate;
    address public owner;
    bool public isPaused;

    mapping(address => uint256) public contributions;
    mapping(address => bool) public hasClaimed;

    uint256 public totalContributions;
    uint256 public hardcap;

    // Stablecoin used to buy tokens
    IERC20 public immutable stable;

    modifier onlyOwner() {
        require(msg.sender == owner, "Not Owner");
        _;
    }

    constructor(
        address _token,
        address _stable,
        uint256 _startDate,
        uint256 _endDate,
        uint256 _hardcap
    ) {
        require(_token != address(0), "Invalid token");
        // crowdsale cannot last more than 1 month
        require(_endDate <= _startDate + 2592000, "Invalid dates");
        token = IERC20(_token);
        stable = IERC20(_stable);
        startDate = _startDate;
        endDate = _endDate;
        hardcap = _hardcap;
        owner = msg.sender;
        isPaused = false;
    }

    /////////// ADMIN FUNCTIONS

    /// @notice Deposit tokens to be sold in crowdsale
    /// @notice tokenAmount Additional amount of tokens sold
    /// @dev Wouldnt work with low decimals tokens but our token has 18 decimals
    function initSale(uint256 tokenAmount) public onlyOwner {
        require(block.timestamp < endDate, "Sale already ended");
        token.safeTransferFrom(msg.sender, address(this), tokenAmount);
        crowdsaleTokenCap = token.balanceOf(address(this));
        tokensPerUSD = crowdsaleTokenCap / hardcap;
        isPaused = false;
    }

    /// @notice Pause sale
    function pauseSale(bool _isPaused) public onlyOwner {
        isPaused = _isPaused;
    }

    /// @notice Owner can withdraw all funds after the crowdsale has ended
    function withdrawFunds() public onlyOwner {
        require(block.timestamp > endDate, "TGE ongoing");
        stable.safeTransfer(owner, stable.balanceOf(address(this)));
        uint256 amountBought = tokensPerUSD * totalContributions;
        // return unsold tokens to admin for burn
        if (amountBought < crowdsaleTokenCap)
            token.safeTransfer(msg.sender, crowdsaleTokenCap - amountBought);
    }

    /////////// USER FUNCTIONS

    /// @notice Buy crowdsale token with USDC
    /// @param amount USDC deposited
    /// @return tokenAmount amount of tokens bought
    function deposit(uint256 amount) public returns (uint256 tokenAmount) {
        require(!isPaused, "TGE paused");
        require(startDate < block.timestamp, "TGE hasnt started");
        require(block.timestamp <= endDate, "TGE has ended");
        require(totalContributions + amount <= hardcap, "Hardcap reached");
        stable.safeTransferFrom(msg.sender, address(this), amount);
        contributions[msg.sender] += amount;
        totalContributions += amount;
        tokenAmount = amount * tokensPerUSD;
        emit TokensPurchased(msg.sender, amount);
    }

    /// @notice Buy crowdsale token with USDC in behalf of someone else
    /// @param amount USDC deposited
    /// @param recipient user receiving the tokens
    /// @return tokenAmount amount of tokens bought
    function depositFor(
        uint256 amount,
        address recipient
    ) public returns (uint256 tokenAmount) {
        require(!isPaused, "TGE paused");
        require(startDate < block.timestamp, "TGE hasnt started");
        require(block.timestamp <= endDate, "TGE has ended");
        require(totalContributions + amount <= hardcap, "Hardcap reached");
        stable.safeTransferFrom(msg.sender, address(this), amount);
        contributions[recipient] += amount;
        totalContributions += amount;
        tokenAmount = amount * tokensPerUSD;
        emit TokensPurchased(recipient, amount);
    }

    /// @notice Claim bought tokens after crowdsale ended
    /// @return tokenAmount Amount of tokens bought
    function claim() public returns (uint256 tokenAmount) {
        require(block.timestamp > endDate, "TGE hasnt ended");
        require(!hasClaimed[msg.sender], "Already Claimed");
        hasClaimed[msg.sender] = true;
        tokenAmount = contributions[msg.sender] * tokensPerUSD;
        token.safeTransfer(msg.sender, tokenAmount);
        emit TokensClaimed(msg.sender, tokenAmount);
    }

    /// @notice Claim bought tokens after crowdsale ended on behalf of someone else
    /// @param recipient user receiving the tokens
    /// @return tokenAmount Amount of tokens bought
    function claimFor(address recipient) public returns (uint256 tokenAmount) {
        require(block.timestamp > endDate, "TGE hasnt ended");
        require(!hasClaimed[recipient], "Already Claimed");
        hasClaimed[recipient] = true;
        tokenAmount = contributions[recipient] * tokensPerUSD;
        token.safeTransfer(recipient, tokenAmount);
        emit TokensClaimed(recipient, tokenAmount);
    }

    /// @notice Claimable amount
    /// @param user Claiming user
    /// @return tokens amount claimable
    function claimable(address user) public view returns (uint256) {
        if (hasClaimed[user] || block.timestamp <= endDate) return 0;
        else return contributions[user] * tokensPerUSD;
    }
}
