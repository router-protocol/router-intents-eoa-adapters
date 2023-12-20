// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

import {IAnkrStakeMatic} from "./Interfaces.sol";
import {RouterIntentAdapter, Errors} from "router-intents/contracts/RouterIntentAdapter.sol";
import {NitroMessageHandler} from "router-intents/contracts/NitroMessageHandler.sol";
import {IERC20, SafeERC20} from "../../../utils/SafeERC20.sol";

/**
 * @title AnkrStakeMatic
 * @author Yashika Goyal
 * @notice Staking MATIC to receive AnkrMATIC on Ankr.
 * @notice This contract is only for Ethereum chain.
 */
contract AnkrStakeMatic is RouterIntentAdapter, NitroMessageHandler {
    using SafeERC20 for IERC20;

    address private immutable _ankrMatic;
    address private immutable _matic;
    IAnkrStakeMatic private immutable _ankrPool;

    event AnkrStakeMaticDest(
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
        address __ankrMatic,
        address __matic,
        address __ankrPool
    )
        RouterIntentAdapter(__native, __wnative, __owner)
        NitroMessageHandler(__assetForwarder, __dexspan)
    {
        _ankrMatic = __ankrMatic;
        _matic = __matic;
        _ankrPool = IAnkrStakeMatic(__ankrPool);
    }

    function ankrMatic() public view returns (address) {
        return _ankrMatic;
    }

    function matic() public view returns (address) {
        return _matic;
    }

    function ankrPool() public view returns (IAnkrStakeMatic) {
        return _ankrPool;
    }

    function name() public pure override returns (string memory) {
        return "AnkrStakeMatic";
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
            IERC20(_matic).safeTransferFrom(msg.sender, self(), _amount);
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

        if (tokenSent != matic()) {
            withdrawTokens(tokenSent, recipient, amount);
            emit OperationFailedRefundEvent(tokenSent, recipient, amount);
            return;
        }

        IERC20(_matic).safeIncreaseAllowance(address(_ankrPool), amount);
        try _ankrPool.stakeAndClaimCerts(amount) {
            uint256 returnAmount = withdrawTokens(
                _ankrMatic,
                recipient,
                type(uint256).max
            );

            emit AnkrStakeMaticDest(recipient, amount, returnAmount);
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
        IERC20(_matic).safeIncreaseAllowance(address(_ankrPool), _amount);
        _ankrPool.stakeAndClaimCerts(_amount);
        uint256 returnAmount = withdrawTokens(
            _ankrMatic,
            _recipient,
            type(uint256).max
        );

        tokens = new address[](2);
        tokens[0] = native();
        tokens[1] = ankrMatic();

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
