// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.18;

interface IComet {
    function allow(address manager, bool isAllowed) external;

    function baseToken() external view returns (address);

    function borrowBalanceOf(address account) external view returns (uint256);

    function collateralBalanceOf(
        address account,
        address asset
    ) external view returns (uint128);

    function supply(address asset, uint amount) external;

    function supplyTo(address dst, address asset, uint amount) external;

    function supplyFrom(
        address from,
        address dst,
        address asset,
        uint amount
    ) external;

    function withdraw(address asset, uint amount) external;

    function withdrawTo(address to, address asset, uint amount) external;

    function withdrawFrom(
        address src,
        address to,
        address asset,
        uint amount
    ) external;
}
