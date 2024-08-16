// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import {IFeeCalculator} from "./Interfaces/IFeeCalculator.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract FeeCalculator is IFeeCalculator, AccessControl {
    using SafeERC20 for IERC20;

    bytes32 public constant SETTER_ROLE = keccak256("SETTER_ROLE");

    Fee public feeConfig;
    address public immutable weth;
    address public constant NATIVE_TOKEN =
        0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

    error InvalidRecipient();
    error InvalidAmount();
    error TransferFailed();

    event SetFee(Fee feeConfig);
    event AdminWithdraw(
        address indexed token,
        address indexed recipient,
        uint256 amount
    );

    constructor(
        address _weth,
        uint80 _maxFee,
        uint80 _flatFee,
        uint80 _bpsFee
    ) {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(SETTER_ROLE, msg.sender);
        weth = _weth;
        feeConfig = Fee({flatFee: _flatFee, maxFee: _maxFee, bpsFee: _bpsFee});
    }

    function setFee(Fee memory _feeConfig) external onlyRole(SETTER_ROLE) {
        feeConfig = _feeConfig;
        emit SetFee(_feeConfig);
    }

    function calculateFee(uint256 amount) external view returns (uint256) {
        Fee memory _feeConfig = feeConfig;
        uint256 fee = _feeConfig.flatFee + (amount * _feeConfig.bpsFee) / 10000;
        if (fee > _feeConfig.maxFee) {
            fee = _feeConfig.maxFee;
        }
        return fee;
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

    receive() external payable {}
}
