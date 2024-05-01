// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import {ILidoStakeMatic} from "./Interfaces.sol";
import {RouterIntentEoaAdapterWithoutDataProvider, EoaExecutorWithoutDataProvider} from "@routerprotocol/intents-core/contracts/RouterIntentEoaAdapter.sol";
import {Errors} from "@routerprotocol/intents-core/contracts/utils/Errors.sol";
import {IERC20, SafeERC20} from "../../../utils/SafeERC20.sol";

/**
 * @title LidoStakeMatic
 * @author Yashika Goyal
 * @notice Staking MATIC to receive StMatic on Lido.
 * @notice This contract is for chains other than Polygon where liquid staking for Matic
 * is supported by Lido
 */
contract LidoStakeMatic is RouterIntentEoaAdapterWithoutDataProvider {
    using SafeERC20 for IERC20;

    address public immutable lidoStMatic;
    address public immutable matic;
    address public immutable referralId;

    constructor(
        address __native,
        address __wnative,
        address __lidoStMatic,
        address __matic,
        address __referralId
    ) RouterIntentEoaAdapterWithoutDataProvider(__native, __wnative) {
        lidoStMatic = __lidoStMatic;
        matic = __matic;
        referralId = __referralId;
    }

    function name() public pure override returns (string memory) {
        return "LidoStakeMatic";
    }

    /**
     * @inheritdoc EoaExecutorWithoutDataProvider
     */
    function execute(
        bytes calldata data
    ) external payable override returns (address[] memory tokens) {
        (address _recipient, uint256 _amount) = parseInputs(data);

        // If the adapter is called using `call` and not `delegatecall`
        if (address(this) == self()) {
            IERC20(matic).safeTransferFrom(msg.sender, self(), _amount);
        } else if (_amount == type(uint256).max)
            _amount = IERC20(matic).balanceOf(address(this));

        bytes memory logData;

        (tokens, logData) = _stake(_recipient, _amount);

        emit ExecutionEvent(name(), logData);
        return tokens;
    }

    //////////////////////////// ACTION LOGIC ////////////////////////////

    function _stake(
        address _recipient,
        uint256 _amount
    ) internal returns (address[] memory tokens, bytes memory logData) {
        IERC20(matic).safeIncreaseAllowance(lidoStMatic, _amount);
        ILidoStakeMatic(lidoStMatic).submit(_amount, referralId);
        uint256 _receivedStMatic = withdrawTokens(
            lidoStMatic,
            _recipient,
            type(uint256).max
        );

        tokens = new address[](2);
        tokens[0] = matic;
        tokens[1] = lidoStMatic;

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
