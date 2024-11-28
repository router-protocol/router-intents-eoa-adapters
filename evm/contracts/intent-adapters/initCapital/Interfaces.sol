// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.18;

abstract contract ILoopingHookUniversalRouter {
    struct MintParams {
        uint16 _mode;
        address _viewer;
        address _tokenIn;
        uint _amtIn;
        address _borrPool;
        uint _borrAmt;
        address _collPool;
        bytes _data;
        uint _minAmtOut;
    }

    function openPos(
        uint16 _mode,
        address _viewer,
        address _tokenIn,
        uint _amtIn,
        address _borrPool,
        uint _borrAmt,
        address _collPool,
        bytes calldata _data,
        uint _minAmtOut
    ) external payable virtual returns (uint posId, uint initPosId, uint amtOut);

    function balanceOf(
        address owner
    ) external view virtual returns (uint256 balance);
}
