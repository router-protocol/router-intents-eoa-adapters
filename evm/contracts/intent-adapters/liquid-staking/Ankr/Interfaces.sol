// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

interface IAnkrStakeAvax {
    function stakeAndClaimCerts() external payable;
}

interface IAnkrStakeBsc {
    function stakeCerts() external payable;
}

interface IAnkrStakeEth {
    function stake() external payable;
}

interface IAnkrStakeMatic {
    function stakeAndClaimCerts(uint256 amount) external;
}

interface IAnkrStakeFtm {
    function stakeAndClaimCerts() external payable;
}

interface IAnkrStakePolygon {
    function swapEth(
        bool nativeToCeros,
        uint256 amountIn,
        address receiver
    ) external payable returns (uint256 amountOut);
}
