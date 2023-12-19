// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

import {IMaticX} from "./Interfaces.sol";
import {RouterIntentAdapter, NitroMessageHandler, Errors} from "router-intents/contracts/RouterIntentAdapter.sol";
import {IERC20, SafeERC20} from "../../../utils/SafeERC20.sol";

/**
 * @title StaderStakeMatic
 * @author Shivam Agrawal
 * @notice Staking Matic to receive MaticX on Stader.
 * @notice This contract is only for Ethereum chain.
 */
contract StaderStakeMatic is RouterIntentAdapter {
    using SafeERC20 for IERC20;

    address public immutable _maticx;
    address public immutable _matic;

    event StaderStakeMaticDest(
        address _recipient,
        uint256 _amount,
        uint256 _receivedMaticX
    );

    constructor(
        address __native,
        address __wnative,
        address __assetForwarder,
        address __dexspan,
        address __defaultRefundAddress,
        address __owner,
        address __maticx,
        address __matic
    )
        RouterIntentAdapter(
            __native,
            __wnative,
            __assetForwarder,
            __dexspan,
            __defaultRefundAddress,
            __owner
        )
    // solhint-disable-next-line no-empty-blocks
    {
        _matic = __matic;
        _maticx = __maticx;
    }

    function maticx() public view returns (address) {
        return _maticx;
    }

    function matic() public view returns (address) {
        return _matic;
    }

    function name() public pure override returns (string memory) {
        return "StaderStakeMatic";
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

        if (tokenSent != _matic) {
            withdrawTokens(tokenSent, recipient, amount);
            emit OperationFailedRefundEvent(tokenSent, recipient, amount);
            return;
        }

        IERC20(_matic).safeIncreaseAllowance(_maticx, amount);

        try IMaticX(_maticx).submit(amount) {
            uint256 receivedMaticX = IERC20(_maticx).balanceOf(address(this));
            withdrawTokens(_maticx, recipient, receivedMaticX);
            emit StaderStakeMaticDest(recipient, amount, receivedMaticX);
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
        IERC20(_matic).safeIncreaseAllowance(_maticx, _amount);
        IMaticX(_maticx).submit(_amount);
        uint256 receivedMaticX = IERC20(_maticx).balanceOf(address(this));
        withdrawTokens(_maticx, _recipient, receivedMaticX);

        tokens = new address[](2);
        tokens[0] = _matic;
        tokens[1] = _maticx;

        logData = abi.encode(_recipient, _amount, receivedMaticX);
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
