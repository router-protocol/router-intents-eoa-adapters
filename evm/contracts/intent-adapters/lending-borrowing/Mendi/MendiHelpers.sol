// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import {ICERC20} from "./interfaces/ICERC20.sol";

contract MendiHelpers {
    address public immutable usdc;
    address public immutable usdt;
    address public immutable dai;
    address public immutable wbtc;
    address public immutable wstEth;
    ICERC20 public immutable meWeth;
    ICERC20 public immutable meUsdc;
    ICERC20 public immutable meUsdt;
    ICERC20 public immutable meDai;
    ICERC20 public immutable meWbtc;
    ICERC20 public immutable meWstEth;

    error InvalidBorrowMarket();
    error InvalidSupplyMarket();

    constructor(
        address __usdc,
        address __usdt,
        address __dai,
        address __wbtc,
        address __wstEth,
        address __meWeth,
        address __meUsdc,
        address __meUsdt,
        address __meDai,
        address __meWbtc,
        address __meWstEth
    ) {
        usdc = __usdc;
        usdt = __usdt;
        dai = __dai;
        wbtc = __wbtc;
        wstEth = __wstEth;
        meWeth = ICERC20(__meWeth);
        meUsdc = ICERC20(__meUsdc);
        meUsdt = ICERC20(__meUsdt);
        meDai = ICERC20(__meDai);
        meWbtc = ICERC20(__meWbtc);
        meWstEth = ICERC20(__meWstEth);
    }
}
