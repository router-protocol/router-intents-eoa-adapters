// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import {IStaking} from "./Interfaces.sol";
import {RouterIntentEoaAdapterWithoutDataProvider, EoaExecutorWithoutDataProvider} from "@routerprotocol/intents-core/contracts/RouterIntentEoaAdapter.sol";
import {Errors} from "@routerprotocol/intents-core/contracts/utils/Errors.sol";
import {IERC20, SafeERC20} from "../../../utils/SafeERC20.sol";

/**
 * @title MantleStakeEth
 * @author Yashika Goyal
 * @notice Staking ETH to receive mEth on Mantle.
 * @notice This contract is only for Ethereum chain.
 */
contract MantleStakeEth is RouterIntentEoaAdapterWithoutDataProvider {
    using SafeERC20 for IERC20;

    address public immutable mEth;
    IStaking public immutable mantlePool;

    constructor(
        address __native,
        address __wnative,
        address __mEth,
        address __mantlePool
    ) RouterIntentEoaAdapterWithoutDataProvider(__native, __wnative) {
        mEth = __mEth;
        mantlePool = IStaking(__mantlePool);
    }

    function name() public pure override returns (string memory) {
        return "MantleStakeEth";
    }

    /**
     * @inheritdoc EoaExecutorWithoutDataProvider
     */
    function execute(
        bytes calldata data
    ) external payable override returns (address[] memory tokens) {
        (address _recipient, uint256 _amount, uint256 minMETHAmount) = parseInputs(data);

        // If the adapter is called using `call` and not `delegatecall`
        if (address(this) == self()) {
            require(
                msg.value == _amount,
                Errors.INSUFFICIENT_NATIVE_FUNDS_PASSED
            );
        } else if (_amount == type(uint256).max)
            _amount = address(this).balance;

        bytes memory logData;

        (tokens, logData) = _stake(_recipient, _amount, minMETHAmount);

        emit ExecutionEvent(name(), logData);
        return tokens;
    }

    //////////////////////////// ACTION LOGIC ////////////////////////////

    function _stake(
        address _recipient,
        uint256 _amount,
        uint256 _minMETHAmount
    ) internal returns (address[] memory tokens, bytes memory logData) {
        mantlePool.stake{value: _amount}(_minMETHAmount);
        uint256 _returnAmount = withdrawTokens(
            mEth,
            _recipient,
            type(uint256).max
        );

        tokens = new address[](2);
        tokens[0] = native();
        tokens[1] = mEth;

        logData = abi.encode(_recipient, _amount, _returnAmount);
    }

    /**
     * @dev function to parse input data.
     * @param data input data.
     */
    function parseInputs(
        bytes memory data
    ) public pure returns (address, uint256, uint256) {
        return abi.decode(data, (address, uint256, uint256));
    }

    // solhint-disable-next-line no-empty-blocks
    receive() external payable {}
}
