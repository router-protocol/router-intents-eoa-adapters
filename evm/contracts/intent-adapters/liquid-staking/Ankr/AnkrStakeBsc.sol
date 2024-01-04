// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

import {IAnkrStakeBsc} from "./Interfaces.sol";
import {RouterIntentEoaAdapter, EoaExecutor} from "router-intents/contracts/RouterIntentEoaAdapter.sol";
import {NitroMessageHandler} from "router-intents/contracts/utils/NitroMessageHandler.sol";
import {Errors} from "router-intents/contracts/utils/Errors.sol";
import {IERC20, SafeERC20} from "../../../utils/SafeERC20.sol";

/**
 * @title AnkrStakeBsc
 * @author Yashika Goyal
 * @notice Staking BSC to receive AnkrBSC on Ankr.
 * @notice This contract is only for BSC chain.
 */
contract AnkrStakeBsc is RouterIntentEoaAdapter, NitroMessageHandler {
    using SafeERC20 for IERC20;

    address private immutable _ankrBsc;
    IAnkrStakeBsc private immutable _ankrPool;

    event AnkrStakeBscDest(
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
        address __ankrBsc,
        address __ankrPool
    )
        RouterIntentEoaAdapter(__native, __wnative, __owner)
        NitroMessageHandler(__assetForwarder, __dexspan)
    {
        _ankrBsc = __ankrBsc;
        _ankrPool = IAnkrStakeBsc(__ankrPool);
    }

    function ankrBsc() public view returns (address) {
        return _ankrBsc;
    }

    function ankrPool() public view returns (IAnkrStakeBsc) {
        return _ankrPool;
    }

    function name() public pure override returns (string memory) {
        return "AnkrStakeBsc";
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

        try _ankrPool.stakeCerts{value: amount}() {
            uint256 returnAmount = withdrawTokens(
                _ankrBsc,
                recipient,
                type(uint256).max
            );

            emit AnkrStakeBscDest(recipient, amount, returnAmount);
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
        _ankrPool.stakeCerts{value: _amount}();
        uint256 returnAmount = withdrawTokens(
            _ankrBsc,
            _recipient,
            type(uint256).max
        );

        tokens = new address[](2);
        tokens[0] = native();
        tokens[1] = ankrBsc();

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