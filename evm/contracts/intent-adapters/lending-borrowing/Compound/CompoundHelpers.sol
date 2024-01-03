// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

import {IComet} from "./interfaces/IComet.sol";

contract CompoundHelpers {
    address private immutable _usdc;
    IComet private immutable _cUSDCV3Pool;
    IComet private immutable _cWETHV3Pool;

    error InvalidBorrowMarket();
    error InvalidSupplyMarket();

    constructor(address __usdc, address __cUSDCV3Pool, address __cWETHV3Pool) {
        _usdc = __usdc;
        _cUSDCV3Pool = IComet(__cUSDCV3Pool);
        _cWETHV3Pool = IComet(__cWETHV3Pool);
    }

    function usdc() public view returns (address) {
        return _usdc;
    }

    function cUSDCV3Pool() public view returns (IComet) {
        return _cUSDCV3Pool;
    }

    function cWETHV3Pool() public view returns (IComet) {
        return _cWETHV3Pool;
    }
}
