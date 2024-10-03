// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.18;

interface IWenToken {
    struct Metadata {
        IWenToken token;
        string name;
        string symbol;
        string description;
        string extended;
        address creator;
        bool isGraduated;
        uint256 mcap;
    }

    function description() external view returns (string memory);
    function extended() external view returns (string memory);
    function wenFoundry() external view returns (address);
    function creator() external view returns (address);
    function holders(uint256 index) external view returns (address);
    function isHolder(address holder) external view returns (bool);
    function isUnrestricted() external view returns (bool);
    function getMetadata() external view returns (Metadata memory);
    function isGraduated() external view returns (bool);
    function setIsUnrestricted(bool _isUnrestricted) external;
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
    function permit(
        address owner,
        address spender,
        uint256 value,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;
    function getHoldersWithBalance(uint256 offset, uint256 limit) external view returns (address[] memory, uint256[] memory);
    function getHolders(uint256 offset, uint256 limit) external view returns (address[] memory);
    function getHoldersLength() external view returns (uint256);
    function balanceOf(address _owner) external view returns (uint256 balance);
}
