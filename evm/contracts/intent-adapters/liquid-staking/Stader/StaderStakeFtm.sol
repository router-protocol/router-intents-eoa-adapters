// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import {IStakeManager} from "./Interfaces.sol";
import {RouterIntentEoaAdapterWithoutDataProvider, EoaExecutorWithoutDataProvider} from "@routerprotocol/intents-core/contracts/RouterIntentEoaAdapter.sol";
import {Errors} from "@routerprotocol/intents-core/contracts/utils/Errors.sol";
import {IERC20, SafeERC20} from "../../../utils/SafeERC20.sol";

/**
 * @title StaderStakeFtm
 * @author Yashika Goyal
 * @notice Staking FTM to receive FtmX on Stader.
 * @notice This contract is only for Fantom chain.
 */
contract StaderStakeFtm is RouterIntentEoaAdapterWithoutDataProvider {
    using SafeERC20 for IERC20;

    address public immutable sftmx;
    IStakeManager public immutable staderPool;

    constructor(
        address __native,
        address __wnative,
        address __sftmx,
        address __staderPool
    ) RouterIntentEoaAdapterWithoutDataProvider(__native, __wnative) {
        sftmx = __sftmx;
        staderPool = IStakeManager(__staderPool);
    }

    function name() public pure override returns (string memory) {
        return "StaderStakeFtm";
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
            require(
                msg.value == _amount,
                Errors.INSUFFICIENT_NATIVE_FUNDS_PASSED
            );
        } else if (_amount == type(uint256).max)
            _amount = address(this).balance;

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
        staderPool.deposit{value: _amount}();
        uint256 receivedSFtmX = withdrawTokens(
            sftmx,
            _recipient,
            type(uint256).max
        );

        tokens = new address[](2);
        tokens[0] = native();
        tokens[1] = sftmx;

        logData = abi.encode(_recipient, _amount, receivedSFtmX);
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
