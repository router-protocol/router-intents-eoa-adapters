// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.18;

interface IWrappedTokenGateway {
    function depositETH(
        address,
        address onBehalfOf,
        uint16 referralCode
    ) external payable;
}
