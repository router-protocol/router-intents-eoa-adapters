// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

import {ILidoStakeEth} from "./Interfaces.sol";
import {RouterIntentAdapter, NitroMessageHandler, Errors} from "router-intents/contracts/RouterIntentAdapter.sol";
import {IERC20, SafeERC20} from "../../../utils/SafeERC20.sol";

/**
 * @title LidoStakeEth
 * @author Yashika Goyal
 * @notice Staking ETH to receive StEth on Lido.
 * @notice This contract is only for Ethereum chain.
 */
contract LidoStakeEth is RouterIntentAdapter {
    using SafeERC20 for IERC20;

    address private immutable _lidoStETH;
    address private immutable _referralId;

    event LidoStakeEthDest(address _recipient, uint256 _amount, uint256 _receivedStEth);

    constructor(
        address __native,
        address __wnative,
        address __assetForwarder,
        address __dexspan,
        address __defaultRefundAddress,
        address __owner,
        address __lidoStETH,
        address __referralId
    )
        RouterIntentAdapter(
            __native,
            __wnative,
            __assetForwarder,
            __dexspan,
            __defaultRefundAddress,
            __owner
        )
    {
        _lidoStETH = __lidoStETH;
        _referralId = __referralId;
    }

    function lidoStEth() public view returns (address) {
        return _lidoStETH;
    }

    function referralId() public view returns (address) {
        return _referralId;
    }

    function name() public pure override returns (string memory) {
        return "LidoStakeEth";
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

        try ILidoStakeEth(_lidoStETH).submit{value: amount}(_referralId) {
            uint256 _receivedStEth = withdrawTokens(
                _lidoStETH,
                recipient,
                type(uint256).max
            );

            emit LidoStakeEthDest(recipient, amount, _receivedStEth);
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
        ILidoStakeEth(_lidoStETH).submit{value: _amount}(_referralId);
        uint256 _receivedStEth = withdrawTokens(
                _lidoStETH,
                _recipient,
                type(uint256).max
            );

        tokens = new address[](2);
        tokens[0] = native();
        tokens[1] = lidoStEth();

        logData = abi.encode(_recipient, _amount, _receivedStEth);
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
