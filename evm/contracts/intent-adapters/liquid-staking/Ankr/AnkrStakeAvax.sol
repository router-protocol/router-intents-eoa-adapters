// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

import {IAnkrStakeAvax} from "./Interfaces.sol";
import {RouterIntentEoaAdapter, EoaExecutor} from "router-intents/contracts/RouterIntentEoaAdapter.sol";
import {Errors} from "../../../Errors.sol";
import {IERC20, SafeERC20} from "../../../utils/SafeERC20.sol";

/**
 * @title AnkrStakeAvax
 * @author Yashika Goyal
 * @notice Staking AVAX to receive AnkrAVAX on Ankr.
 * @notice This contract is only for Avalanche chain.
 */
contract AnkrStakeAvax is RouterIntentEoaAdapter {
    using SafeERC20 for IERC20;

    address public immutable ankrAvax;
    IAnkrStakeAvax public immutable ankrPool;

    constructor(
        address __native,
        address __wnative,
        address __ankrAvax,
        address __ankrPool
    ) RouterIntentEoaAdapter(__native, __wnative, false, address(0)) {
        ankrAvax = __ankrAvax;
        ankrPool = IAnkrStakeAvax(__ankrPool);
    }

    function name() public pure override returns (string memory) {
        return "AnkrStakeAvax";
    }

    /**
     * @inheritdoc EoaExecutor
     */
    function execute(
        address,
        address,
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
        ankrPool.stakeAndClaimCerts{value: _amount}();
        uint256 returnAmount = withdrawTokens(
            ankrAvax,
            _recipient,
            type(uint256).max
        );

        tokens = new address[](2);
        tokens[0] = native();
        tokens[1] = ankrAvax;

        logData = abi.encode(_recipient, _amount, returnAmount);
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
