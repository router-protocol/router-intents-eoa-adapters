// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import {VirtualsDepositsWrapper} from "./Interfaces.sol";
import {RouterIntentEoaAdapterWithoutDataProvider, EoaExecutorWithoutDataProvider} from "@routerprotocol/intents-core/contracts/RouterIntentEoaAdapter.sol";
import {Errors} from "@routerprotocol/intents-core/contracts/utils/Errors.sol";
import {IERC20, SafeERC20} from "../../../utils/SafeERC20.sol";
import {SafeMath} from "../../../utils/SafeMath.sol";

/**
 * @title VirtualsDeposits
 * @author Ankush
 * @notice Staking Virtual Tokens to buy AI Agent Tokens.
 * @dev Only Virtual Tokens can be used for deposits.
 */
contract VirtualsDeposits is RouterIntentEoaAdapterWithoutDataProvider {
    using SafeERC20 for IERC20;
    using SafeMath for uint256;

    address public immutable virtualToken;
    VirtualsDepositsWrapper public immutable depositWrapper;

    constructor(
        address __native,
        address __wnative,
        address __virtualToken,
        address __depositWrapper
    ) RouterIntentEoaAdapterWithoutDataProvider(__native, __wnative) {
        virtualToken = __virtualToken;
        depositWrapper = VirtualsDepositsWrapper(__depositWrapper);
    }

    function name() public pure override returns (string memory) {
        return "VirtualsDeposits";
    }

    /**
     * @inheritdoc EoaExecutorWithoutDataProvider
     */
    function execute(
        bytes calldata data
    ) external payable override returns (address[] memory tokens) {
        (
            address _tokenIn,
            address _tokenOut,
            address _recipient,
            uint256 _amount
        ) = parseInputs(data);

        require(_tokenIn == virtualToken, "Invalid Token"); // Restrict deposits to Virtual Tokens

        // If the adapter is called using `call` and not `delegatecall`
        if (address(this) == self()) {
            IERC20(_tokenIn).safeTransferFrom(msg.sender, self(), _amount);
        } else if (_amount == type(uint256).max)
            _amount = IERC20(_tokenIn).balanceOf(address(this));

        bytes memory logData;
        // Call the buy function
        (tokens, logData) = _buyAIAgentToken(_recipient, _amount, _tokenOut);

        emit ExecutionEvent(name(), logData);
        return tokens;
    }

    //////////////////////////// BUY FUNCTION ////////////////////////////

    /**
     * @dev Handles Virtual Token deposits and buys AI Agent Tokens.
     * @param _recipient Address receiving the AI Agent Tokens.
     * @param _amount Amount of Virtual Tokens to deposit.
     */
    function _buyAIAgentToken(
        address _recipient,
        uint256 _amount,
        address _tokenOut
    ) internal returns (address[] memory tokens, bytes memory logData) {
        require(_amount > 0, "Required amount is greater than zero");

        uint256 _aiTokenAmountBefore = getBalance(_tokenOut, address(this));

        // Approve Deposit Wrapper contract to use Virtual Tokens
        IERC20(virtualToken).safeIncreaseAllowance(
            address(depositWrapper),
            _amount
        );

        // Buy AI Agent Tokens
        bool success = depositWrapper.buy(_amount, _tokenOut);
        require(success, "Buy failed");

        uint256 _aiTokenAmountReceived = getBalance(_tokenOut, address(this)).sub(
            _aiTokenAmountBefore
        );

        withdrawTokens(_tokenOut, _recipient, _aiTokenAmountReceived);

        // Define tokens array
        tokens = new address[](2);
        tokens[0] = virtualToken;
        tokens[1] = _tokenOut;

        logData = abi.encode(virtualToken, _recipient, _amount);
    }

    /**
     * @dev Parses input data into parameters.
     * @param data The input data.
     * @return The parsed parameters (token address, recipient address, and amount).
     */
    function parseInputs(
        bytes memory data
    ) public pure returns (address, address, address, uint256) {
        return abi.decode(data, (address, address, address, uint256));
    }

    // solhint-disable-next-line no-empty-blocks
    receive() external payable {}
}
