// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

import {IStaderPool} from "./Interfaces.sol";
import {RouterIntentAdapter, NitroMessageHandler, Errors} from "router-intents/contracts/RouterIntentAdapter.sol";
import {IERC20, SafeERC20} from "../../../utils/SafeERC20.sol";

/**
 * @title StaderStakeEth
 * @author Shivam Agrawal
 * @notice Staking ETH to receive EthX on Stader.
 * @notice This contract is only for Ethereum chain.
 */
contract StaderStakeEth is RouterIntentAdapter {
    using SafeERC20 for IERC20;

    address private immutable _self;
    address private immutable _ethx;
    IStaderPool private immutable _staderPool;

    event StaderStakeEthDest(address _recipient, uint256 _amount);

    constructor(
        address __native,
        address __wnative,
        address __assetForwarder,
        address __dexspan,
        address __defaultRefundAddress,
        address __ethx,
        address __staderPool
    )
        RouterIntentAdapter(
            __native,
            __wnative,
            __assetForwarder,
            __dexspan,
            __defaultRefundAddress
        )
    // solhint-disable-next-line no-empty-blocks
    {
        _self = address(this);
        _ethx = __ethx;
        _staderPool = IStaderPool(__staderPool);
    }

    function ethx() public view returns (address) {
        return _ethx;
    }

    function staderPool() public view returns (IStaderPool) {
        return _staderPool;
    }

    function name() public pure override returns (string memory) {
        return "StaderStakeEth";
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
        if (address(this) == _self) {
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

        _staderPool.deposit{value: amount}(recipient);

        emit StaderStakeEthDest(recipient, amount);
    }

    //////////////////////////// ACTION LOGIC ////////////////////////////

    function _stake(
        address _recipient,
        uint256 _amount
    ) internal returns (address[] memory tokens, bytes memory logData) {
        _staderPool.deposit{value: _amount}(_recipient);

        tokens = new address[](2);
        tokens[0] = native();
        tokens[1] = ethx();

        logData = abi.encode(_recipient, _amount);
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
}
