// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

interface ILidoStakeEth {
    function submit(address _referral) external payable returns (uint256);
}

interface ILidoStakeMatic {
    function submit(
        uint256 _amount,
        address _referral
    ) external returns (uint256);
}
