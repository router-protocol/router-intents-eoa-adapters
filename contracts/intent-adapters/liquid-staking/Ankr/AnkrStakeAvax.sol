// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

import {IAnkrStakeAvax} from "./Interfaces.sol";
import {RouterIntentAdapter, Errors} from "router-intents/contracts/RouterIntentAdapter.sol";
import {NitroMessageHandler} from "router-intents/contracts/NitroMessageHandler.sol";
import {IERC20, SafeERC20} from "../../../utils/SafeERC20.sol";

/**
 * @title AnkrStakeAvax
 * @author Yashika Goyal
 * @notice Staking AVAX to receive AnkrAVAX on Ankr.
 * @notice This contract is only for Avalanche chain.
 */
contract AnkrStakeAvax is RouterIntentAdapter, NitroMessageHandler {
    using SafeERC20 for IERC20;

    address private immutable _ankrAvax;
    IAnkrStakeAvax private immutable _ankrPool;

    event AnkrStakeAvaxDest(address _recipient, uint256 _amount, uint256 _returnAmount);

    constructor(
        address __native,
        address __wnative,
        address __owner,
        address __assetForwarder,
        address __dexspan,
        address __ankrAvax,
        address __ankrPool
    )
        RouterIntentAdapter(__native, __wnative, __owner)
        NitroMessageHandler(__assetForwarder, __dexspan)
    {
        _ankrAvax = __ankrAvax;
        _ankrPool = IAnkrStakeAvax(__ankrPool);
    }

    function ankrAvax() public view returns (address) {
        return _ankrAvax;
    }

    function ankrPool() public view returns (IAnkrStakeAvax) {
        return _ankrPool;
    }

    function name() public pure override returns (string memory) {
        return "AnkrStakeAvax";
    }

    /**
     * @inheritdoc RouterIntentAdapter
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
        }

        bytes memory logData;

        (tokens, logData) = _stake(_recipient, _amount);

        emit ExecutionEvent(name(), logData);
        return tokens;
    }

    /**
     * @inheritdoc NitroMessageHandler
     */
    function handleMessage(
        address tokenSent,
        uint256 amount,
        bytes memory instruction
    ) external override onlyNitro nonReentrant {
        address recipient = abi.decode(instruction, (address));

        if (tokenSent != native()) {
            withdrawTokens(tokenSent, recipient, amount);
            emit OperationFailedRefundEvent(tokenSent, recipient, amount);
            return;
        }

        try _ankrPool.stakeAndClaimCerts{value: amount}() {
            uint256 returnAmount = withdrawTokens(
                _ankrAvax,
                recipient,
                type(uint256).max
            );

            emit AnkrStakeAvaxDest(recipient, amount, returnAmount);
        } catch {
            withdrawTokens(tokenSent, recipient, amount);
            emit OperationFailedRefundEvent(tokenSent, recipient, amount);
        }
    }

    //////////////////////////// ACTION LOGIC ////////////////////////////

    function _stake(
        address _recipient,
        uint256 _amount
    ) internal returns (address[] memory tokens, bytes memory logData) {
        _ankrPool.stakeAndClaimCerts{value: _amount}();
        uint256 returnAmount = withdrawTokens(
                _ankrAvax,
                _recipient,
                type(uint256).max
            );

        tokens = new address[](2);
        tokens[0] = native();
        tokens[1] = ankrAvax();

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
