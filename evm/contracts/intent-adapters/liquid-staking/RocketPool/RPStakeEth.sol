// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import {IRocketDepositPool} from "./Interfaces.sol";
import {RouterIntentEoaAdapterWithoutDataProvider, EoaExecutorWithoutDataProvider} from "@routerprotocol/intents-core/contracts/RouterIntentEoaAdapter.sol";
import {Errors} from "@routerprotocol/intents-core/contracts/utils/Errors.sol";
import {IERC20, SafeERC20} from "../../../utils/SafeERC20.sol";

/**
 * @title RPStakeEth
 * @author Yashika Goyal
 * @notice Staking ETH to receive rETH on RocketPool.
 * @notice This contract is only for Ethereum chain.
 */
contract RPStakeEth is RouterIntentEoaAdapterWithoutDataProvider {
    using SafeERC20 for IERC20;

    IRocketDepositPool public immutable rocketDepositPool;
    address public immutable rEth;

    constructor(
        address __native,
        address __wnative,
        address __rEth,
        address __rocketDepositPool
    ) RouterIntentEoaAdapterWithoutDataProvider(__native, __wnative) {
        rEth = __rEth;
        rocketDepositPool = IRocketDepositPool(__rocketDepositPool);
    }

    function name() public pure override returns (string memory) {
        return "RPStakeEth";
    }

    /**
     * @inheritdoc EoaExecutorWithoutDataProvider
     */
    function execute(
        bytes calldata data
    ) external payable override returns (address[] memory tokens) {
        (address _recipient, uint256 _amount) = parseInputs(data);

        // If the adapter is called using `call` and not `delegatecall`
        if (address(this) == self()) {
            require(
                msg.value == _amount,
                Errors.INSUFFICIENT_NATIVE_FUNDS_PASSED
            );
        } else if (_amount == type(uint256).max)
            _amount = address(this).balance;

        bytes memory logData;

        (tokens, logData) = _stake(_recipient, _amount);

        emit ExecutionEvent(name(), logData);
        return tokens;
    }

    //////////////////////////// ACTION LOGIC ////////////////////////////

    function _stake(
        address _recipient,
        uint256 _amount
    ) internal returns (address[] memory tokens, bytes memory logData) {
        rocketDepositPool.deposit{value: _amount}();
        uint256 _receivedREth = withdrawTokens(
            rEth,
            _recipient,
            type(uint256).max
        );

        tokens = new address[](2);
        tokens[0] = native();
        tokens[1] = rEth;

        logData = abi.encode(_recipient, _amount, _receivedREth);
    }

    /**
     * @dev function to parse input data.
     * @param data input data.
     */
    function parseInputs(
        bytes memory data
    ) public pure returns (address, uint256) {
        return abi.decode(data, (address, uint256));
    }

    // solhint-disable-next-line no-empty-blocks
    receive() external payable {}
}
