// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./Interfaces/ITokenOracle.sol";
import "./Interfaces/IFeeCalculator.sol";
import "./Interfaces/IStakeStoneVault.sol";

contract StakeStoneVault is IVault, AccessControl{
    using SafeERC20 for IERC20;

    bytes32 public constant SETTER_ROLE = keccak256("SETTER_ROLE");
    address public constant NATIVE_TOKEN = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;
    
    address public immutable weth;
    address public immutable stoneToken;

    address public oracle;
    uint256 public maxBlockDifference;
    IFeeCalculator public feeContract;

    error InvalidRecipient();
    error InvalidAmount();
    error TransferFailed();
    error FeeNotWithdrawnFromPreviousContract();

    event SetOracle(address _oracle);
    event SetFeeContract(address indexed _feeContract);
    event SetMaxBlockDifference(uint256 _maxBlockDifference);
    event Deposit(address indexed _sender, address indexed _receiver, uint256 _amount, uint256 _stoneAmount, uint256 _fee);
    event AdminWithdraw(address indexed token, address indexed recipient, uint256 amount);

    constructor(address _oracle, address _weth, address _stoneToken, address _feeContract, uint256 _maxBlockDifference) {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(SETTER_ROLE, msg.sender);
        oracle = _oracle;
        weth = _weth;
        stoneToken = _stoneToken;
        maxBlockDifference = _maxBlockDifference;
        feeContract = IFeeCalculator(_feeContract);
    }

    function getOraclePrice() public view returns (uint256, uint256) {
        return ITokenOracle(oracle).getTokenPriceWithBlock();
    }

    function getFee(uint256 _amountInWeth) external view returns (uint256) {
        return feeContract.calculateFee(_amountInWeth);
    }

    function getNetAmountInWeth(uint256 _amountInWeth) public view returns (uint256) {
        uint256 fee = this.getFee(_amountInWeth);
        return _amountInWeth - fee;
    }

    function setOracle(address _oracle) external onlyRole(SETTER_ROLE) {
        oracle = _oracle;
        emit SetOracle(_oracle);
    }

    function setFeeContract(address _feeContract) external onlyRole(SETTER_ROLE) {
        if (address(feeContract) != address(0) && IERC20(weth).balanceOf(address(feeContract)) != 0) 
            revert FeeNotWithdrawnFromPreviousContract();
        
        feeContract = IFeeCalculator(_feeContract);
        emit SetFeeContract(_feeContract);
    }

    function setMaxBlockDifference(uint256 _maxBlockDifference) external onlyRole(SETTER_ROLE) {
        maxBlockDifference = _maxBlockDifference;
        emit SetMaxBlockDifference(_maxBlockDifference);
    }

    function deposit(uint256 _amount, address _receiver) external returns(uint256 stoneAmount) {
        (uint256 oraclePrice, uint256 lastUpdatedBlock) = getOraclePrice();
        require(
            block.number <= lastUpdatedBlock + maxBlockDifference,
            "StakeStone Vault: Cannot mint STONE, Price not updated recently"
        );

        IERC20(weth).safeTransferFrom(msg.sender, address(this), _amount);

        uint256 fee = feeContract.calculateFee(_amount);
        _amount = _amount - fee;
        IERC20(weth).safeTransfer(address(feeContract), fee);
        
        stoneAmount = _amount * oraclePrice / 10**18;        

        IERC20(stoneToken).safeTransfer(_receiver, stoneAmount);
        
        emit Deposit(msg.sender, _receiver, _amount, stoneAmount, fee);
        return stoneAmount;
    }

    function adminWithdraw(
        address token,
        address recipient,
        uint256 amount
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (recipient == address(0)) revert InvalidRecipient();

        if (token == NATIVE_TOKEN) {
            if (amount == 0) amount = address(this).balance;
            if (amount == 0) revert InvalidAmount();

            (bool success, ) = payable(recipient).call{value: amount}("");
            if (!success) revert TransferFailed();
        } else {
            if (amount == 0) amount = IERC20(token).balanceOf(address(this));
            if (amount == 0) revert InvalidAmount();

            IERC20(token).safeTransfer(recipient, amount);
        }
        emit AdminWithdraw(token, recipient, amount);
    }
}