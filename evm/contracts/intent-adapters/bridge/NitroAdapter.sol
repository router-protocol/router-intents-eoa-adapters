// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

import {RouterIntentEoaAdapter, EoaExecutor} from "router-intents/contracts/RouterIntentEoaAdapter.sol";
import {Errors} from "../../Errors.sol";
import {IERC20, SafeERC20} from "../../utils/SafeERC20.sol";

/**
 * @title NitroAdapter
 * @author Shivam Agrawal
 * @notice Adapter for bridging funds and instructions to another chain.
 */
contract NitroAdapter is RouterIntentEoaAdapter {
    using SafeERC20 for IERC20;

    address public immutable assetForwarder;
    address public immutable dexspan;

    constructor(
        address __native,
        address __wnative,
        address __assetForwarder,
        address __dexspan
    )
        RouterIntentEoaAdapter(__native, __wnative, false, address(0))
    // solhint-disable-next-line no-empty-blocks
    {
        assetForwarder = __assetForwarder;
        dexspan = __dexspan;
    }

    function name() public pure override returns (string memory) {
        return "NitroAdapter";
    }

    /**
     * @inheritdoc EoaExecutor
     */
    function execute(
        address,
        address,
        bytes calldata data
    ) external payable override returns (address[] memory tokens) {
        (
            address _bridgeAddr,
            address _srcToken,
            uint256 _srcAmount,
            bytes memory _calldata
        ) = parseInputs(data);

        require(
            _bridgeAddr == assetForwarder || _bridgeAddr == dexspan,
            Errors.INVALID_BRIDGE_ADDRESS
        );

        uint256 value = 0;
        if (_srcToken != native())
            IERC20(_srcToken).safeIncreaseAllowance(_bridgeAddr, _srcAmount);
        else value = _srcAmount;

        (bool success, ) = _bridgeAddr.call{value: value}(_calldata);

        require(success, Errors.BRIDGE_CALL_FAILED);

        bytes memory logData = abi.encode(_bridgeAddr, _srcToken, _srcAmount);

        address[] memory _tokens = new address[](1);
        _tokens[0] = _srcToken;

        emit ExecutionEvent(name(), logData);
        return _tokens;
    }

    function _pullTokens(
        address token,
        uint256 amount
    ) internal returns (uint256) {
        uint256 totalValue = 0;
        if (token == native()) {
            totalValue += amount;
        } else {
            IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        }

        return totalValue;
    }

    /**
     * @dev function to parse input data.
     * @param data input data.
     */
    function parseInputs(
        bytes memory data
    ) public pure returns (address, address, uint256, bytes memory) {
        (
            address _bridgeAddr,
            address _srcToken,
            uint256 _srcAmount,
            bytes memory _calldata
        ) = abi.decode(data, (address, address, uint256, bytes));

        return (_bridgeAddr, _srcToken, _srcAmount, _calldata);
    }
}
