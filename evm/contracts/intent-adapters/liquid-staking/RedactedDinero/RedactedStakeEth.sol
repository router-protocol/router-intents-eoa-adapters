// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import {IPirexEth} from "./Interfaces.sol";
import {RouterIntentEoaAdapter, EoaExecutor} from "router-intents/contracts/RouterIntentEoaAdapter.sol";
import {Errors} from "../../../Errors.sol";
import {IERC20, SafeERC20} from "../../../utils/SafeERC20.sol";

/**
 * @title RedactedStakeEth
 * @author Yashika Goyal
 * @notice Staking ETH to receive pxEth on Redacted.
 * @notice This contract is only for Ethereum chain.
 */
contract RedactedStakeEth is RouterIntentEoaAdapter {
    using SafeERC20 for IERC20;

    address public immutable pxEth;
    IPirexEth public immutable pirexPool;

    constructor(
        address __native,
        address __wnative,
        address __pxEth,
        address __pirexPool
    ) RouterIntentEoaAdapter(__native, __wnative, false, address(0)) {
        pxEth = __pxEth;
        pirexPool = IPirexEth(__pirexPool);
    }

    function name() public pure override returns (string memory) {
        return "RedactedStakeEth";
    }

    /**
     * @inheritdoc EoaExecutor
     */
    function execute(
        address,
        address,
        bytes calldata data
    ) external payable override returns (address[] memory tokens) {
        (address _recipient, uint256 _amount, bool _shouldCompound) = parseInputs(data);

        // If the adapter is called using `call` and not `delegatecall`
        if (address(this) == self()) {
            require(
                msg.value == _amount,
                Errors.INSUFFICIENT_NATIVE_FUNDS_PASSED
            );
        } else if (_amount == type(uint256).max)
            _amount = address(this).balance;

        bytes memory logData;

        (tokens, logData) = _stake(_recipient, _amount, _shouldCompound);

        emit ExecutionEvent(name(), logData);
        return tokens;
    }

    //////////////////////////// ACTION LOGIC ////////////////////////////

    function _stake(
        address _recipient,
        uint256 _amount,
        bool _shouldCompound
    ) internal returns (address[] memory tokens, bytes memory logData) {
        (uint256 _returnAmount, ) = pirexPool.deposit{value: _amount}(_recipient, _shouldCompound);

        tokens = new address[](2);
        tokens[0] = native();
        tokens[1] = pxEth;

        logData = abi.encode(_recipient, _amount, _returnAmount);
    }

    /**
     * @dev function to parse input data.
     * @param data input data.
     */
    function parseInputs(
        bytes memory data
    ) public pure returns (address, uint256, bool) {
        return abi.decode(data, (address, uint256, bool));
    }

    // solhint-disable-next-line no-empty-blocks
    receive() external payable {}
}
