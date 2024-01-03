// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

import {IMetaPoolStakeEth} from "./Interfaces.sol";
import {RouterIntentEoaAdapter, EoaExecutor} from "router-intents/contracts/RouterIntentEoaAdapter.sol";
import {NitroMessageHandler} from "router-intents/contracts/utils/NitroMessageHandler.sol";
import {Errors} from "router-intents/contracts/utils/Errors.sol";
import {IERC20, SafeERC20} from "../../../utils/SafeERC20.sol";

/**
 * @title MetaPoolStakeEth
 * @author Yashika Goyal
 * @notice Staking ETH to receive mpETH on MetaPool.
 * @notice This contract is only for Ethereum chain.
 */
contract MetaPoolStakeEth is RouterIntentEoaAdapter, NitroMessageHandler {
    using SafeERC20 for IERC20;

    address private immutable _mpEth;
    IMetaPoolStakeEth private immutable _metaPoolPool;

    event MetaPoolStakeEthDest(
        address _recipient,
        uint256 _amount,
        uint256 _returnAmount
    );

    constructor(
        address __native,
        address __wnative,
        address __owner,
        address __assetForwarder,
        address __dexspan,
        address __mpEth,
        address __metaPoolPool
    )
        RouterIntentEoaAdapter(__native, __wnative, __owner)
        NitroMessageHandler(__assetForwarder, __dexspan)
    {
        _mpEth = __mpEth;
        _metaPoolPool = IMetaPoolStakeEth(__metaPoolPool);
    }

    function mpEth() public view returns (address) {
        return _mpEth;
    }

    function metaPoolPool() public view returns (IMetaPoolStakeEth) {
        return _metaPoolPool;
    }

    function name() public pure override returns (string memory) {
        return "MetaPoolStakeEth";
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

        try _metaPoolPool.depositETH{value: amount}(recipient) returns (
            uint256 returnAmount
        ) {
            emit MetaPoolStakeEthDest(recipient, amount, returnAmount);
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
        uint256 _returnAmount = _metaPoolPool.depositETH{value: _amount}(
            _recipient
        );

        tokens = new address[](2);
        tokens[0] = native();
        tokens[1] = mpEth();

        logData = abi.encode(_recipient, _amount, _returnAmount);
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
