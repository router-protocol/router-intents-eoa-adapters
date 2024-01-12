// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import {IMaticX} from "./Interfaces.sol";
import {RouterIntentEoaAdapter, EoaExecutor} from "router-intents/contracts/RouterIntentEoaAdapter.sol";
import {Errors} from "../../../Errors.sol";
import {IERC20, SafeERC20} from "../../../utils/SafeERC20.sol";

/**
 * @title StaderStakeMatic
 * @author Shivam Agrawal
 * @notice Staking Matic to receive MaticX on Stader.
 * @notice This contract is only for Ethereum chain.
 */
contract StaderStakeMatic is RouterIntentEoaAdapter {
    using SafeERC20 for IERC20;

    address public immutable maticx;
    address public immutable matic;

    constructor(
        address __native,
        address __wnative,
        address __maticx,
        address __matic
    )
        RouterIntentEoaAdapter(__native, __wnative, false, address(0))
    // solhint-disable-next-line no-empty-blocks
    {
        matic = __matic;
        maticx = __maticx;
    }

    function name() public pure override returns (string memory) {
        return "StaderStakeMatic";
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
        IERC20(matic).safeIncreaseAllowance(maticx, _amount);
        IMaticX(maticx).submit(_amount);
        uint256 receivedMaticX = IERC20(maticx).balanceOf(address(this));
        withdrawTokens(maticx, _recipient, receivedMaticX);

        tokens = new address[](2);
        tokens[0] = matic;
        tokens[1] = maticx;

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
