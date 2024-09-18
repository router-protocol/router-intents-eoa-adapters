// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

interface IUltraLRTEthereum {
    /**
     * @notice Deposit assets into the vault
     * @param receiver The address of the receiver
     * @return The amount of shares minted
     */
    function deposit(
        uint256 assets,
        address receiver
    ) external returns (uint256);

    function asset() external view returns (address);

    function baseAsset() external view returns (address);
}

interface IUltraLRT {
    function deposit(
        uint256 assets,
        address receiver
    ) external;

    function baseAsset() external view returns (address);
}
