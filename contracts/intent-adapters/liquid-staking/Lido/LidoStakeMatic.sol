// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

import {ILidoStakeMatic} from "./Interfaces.sol";
import {RouterIntentAdapter, NitroMessageHandler, Errors} from "router-intents/contracts/RouterIntentAdapter.sol";
import {IERC20, SafeERC20} from "../../../utils/SafeERC20.sol";

/**
 * @title LidoStakeMatic
 * @author Yashika Goyal
 * @notice Staking MATIC to receive StMatic on Lido.
 * @notice This contract is for chains other than Polygon where liquid staking for Matic
 * is supported by Lido
 */
contract LidoStakeMatic is RouterIntentAdapter {
    using SafeERC20 for IERC20;

    address private immutable _lidoStMatic;
    address private immutable _matic;
    address private immutable _referralId;

    event LidoStakeMaticDest(address _recipient, uint256 _amount, uint256 _receivedStMatic);

    constructor(
        address __native,
        address __wnative,
        address __assetForwarder,
        address __dexspan,
        address __defaultRefundAddress,
        address __owner,
        address __lidoStMatic,
        address __matic,
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
        _lidoStMatic = __lidoStMatic;
        _matic = __matic;
        _referralId = __referralId;
    }

    function lidoStMatic() public view returns (address) {
        return _lidoStMatic;
    }
     
    function matic() public view returns (address) {
        return _matic;
    }

    function referralId() public view returns (address) {
        return _referralId;
    }

    function name() public pure override returns (string memory) {
        return "LidoStakeMatic";
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

        IERC20(_matic).safeIncreaseAllowance(_lidoStMatic, amount);
        try ILidoStakeMatic(_lidoStMatic).submit(amount, _referralId) {
            uint256 _receivedStMatic = withdrawTokens(
                _lidoStMatic,
                recipient,
                type(uint256).max
            );

            emit LidoStakeMaticDest(recipient, amount, _receivedStMatic);
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
        IERC20(_matic).safeIncreaseAllowance(_lidoStMatic, _amount);
        ILidoStakeMatic(_lidoStMatic).submit(_amount, _referralId);
        uint256 _receivedStMatic = withdrawTokens(
                _lidoStMatic,
                _recipient,
                type(uint256).max
            );

        tokens = new address[](2);
        tokens[0] = native();
        tokens[1] = lidoStMatic();

        logData = abi.encode(_recipient, _amount, _receivedStMatic);
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
