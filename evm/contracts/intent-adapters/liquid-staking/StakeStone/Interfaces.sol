// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

interface IStoneVault {
    function deposit()
    external
    payable
    returns (uint256 mintAmount);
}

interface ILzOft {
    function sendFrom(
        address _from,
        uint16 _dstChainId,
        bytes calldata _toAddress,
        uint _amount,
        address payable _refundAddress,
        address _zroPaymentAddress,
        bytes calldata _adapterParams
    ) external payable;
}

interface IStakeStoneVault {
    function deposit(uint256 _amount, address _receiver) external returns(uint256 stoneAmount);
}
