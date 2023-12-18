// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

import {RouterIntentAdapter, NitroMessageHandler, Errors} from "router-intents/contracts/RouterIntentAdapter.sol";
import {IERC20, SafeERC20} from "../../utils/SafeERC20.sol";

/**
 * @title ERC20Approval
 * @author Shivam Agrawal
 * @notice Providing approval for ERC20 tokens.
 */
contract ERC20Approval is RouterIntentAdapter {
    using SafeERC20 for IERC20;

    constructor(
        address __native,
        address __wnative,
        address __assetForwarder,
        address __dexspan,
        address __defaultRefundAddress,
        address __owner
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

    }

    function name() public pure override returns (string memory) {
        return "ERC20Approval";
    }

    /**
     * @inheritdoc RouterIntentAdapter
     */
    function execute(
        address,
        address,
        bytes calldata data
    ) external payable override returns (address[] memory tokens) {
        (
            address[] memory _tokens,
            uint256[] memory _amounts,
            address[] memory _recipients
        ) = parseInputs(data);

        require(
            _tokens.length != 0 &&
                _tokens.length != _amounts.length &&
                _amounts.length != _recipients.length,
            Errors.ARRAY_LENGTH_MISMATCH
        );

        for (uint256 i = 0; i < tokens.length; ) {
            IERC20(tokens[i]).safeIncreaseAllowance(
                _recipients[i],
                _amounts[i]
            );

            unchecked {
                ++i;
            }
        }

        bytes memory logData = abi.encode(_tokens, _amounts, _recipients);

        emit ExecutionEvent(name(), logData);
        return _tokens;
    }

    /**
     * @inheritdoc NitroMessageHandler
     */
    function handleMessage(
        address tokenSent,
        uint256 amount,
        bytes memory
    ) external override onlyNitro nonReentrant {
        withdrawTokens(tokenSent, defaultRefundAddress(), amount);
        emit UnsupportedOperation(tokenSent, defaultRefundAddress(), amount);
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
    )
        public
        pure
        returns (address[] memory, uint256[] memory, address[] memory)
    {
        (
            address[] memory _tokens,
            uint256[] memory _amounts,
            address[] memory _recipients
        ) = abi.decode(data, (address[], uint256[], address[]));

        return (_tokens, _amounts, _recipients);
    }
}
