// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

import {IStaderPool} from "./Interfaces.sol";
import {RouterIntentAdapter, NitroMessageHandler, Errors} from "router-intents/contracts/RouterIntentAdapter.sol";
import {IERC20, SafeERC20} from "../../../utils/SafeERC20.sol";

/**
 * @title StaderStakePolygon
 * @author Shivam Agrawal
 * @notice Staking MATIC to receive MaticX on Stader.
 * @notice This contract is only for Polygon chain.
 */
contract StaderStakePolygon is RouterIntentAdapter {
    using SafeERC20 for IERC20;

    address public immutable _maticx;
    IStaderPool public immutable _staderPool;

    event StaderStakePolygonDest(
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
        address __staderPool
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
        _maticx = __maticx;
        _staderPool = IStaderPool(__staderPool);
    }

    function maticx() public view returns (address) {
        return _maticx;
    }

    function staderPool() public view returns (IStaderPool) {
        return _staderPool;
    }

    function name() public pure override returns (string memory) {
        return "StaderStakePolygon";
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

        try _staderPool.swapMaticForMaticXViaInstantPool{value: amount}() {
            uint256 receivedMaticX = withdrawTokens(
                _maticx,
                recipient,
                type(uint256).max
            );

            emit StaderStakePolygonDest(recipient, amount, receivedMaticX);
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
        _staderPool.swapMaticForMaticXViaInstantPool{value: _amount}();
        uint256 receivedMaticX = withdrawTokens(
            _maticx,
            _recipient,
            type(uint256).max
        );

        tokens = new address[](2);
        tokens[0] = native();
        tokens[1] = maticx();

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

    // solhint-disable-next-line no-empty-blocks
    receive() external payable {}
}
