// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import {IComet} from "./interfaces/IComet.sol";

contract CompoundHelpers {
    address public immutable usdc;
    IComet public immutable cUSDCV3Pool;
    IComet public immutable cWETHV3Pool;

    error InvalidBorrowMarket();
    error InvalidSupplyMarket();

    constructor(address __usdc, address __cUSDCV3Pool, address __cWETHV3Pool) {
        usdc = __usdc;
        cUSDCV3Pool = IComet(__cUSDCV3Pool);
        cWETHV3Pool = IComet(__cWETHV3Pool);
    }
}
