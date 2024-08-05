// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import {IStakeStoneVault} from "./Interfaces.sol";
import {RouterIntentEoaAdapterWithoutDataProvider, EoaExecutorWithoutDataProvider} from "@routerprotocol/intents-core/contracts/RouterIntentEoaAdapter.sol";
import {Errors} from "@routerprotocol/intents-core/contracts/utils/Errors.sol";
import {IERC20, SafeERC20} from "../../../utils/SafeERC20.sol";

/**
 * @title StakeStoneVaultAdapter
 * @author Yashika Goyal
 * @notice Staking WETH to receive STONE on StakeStone.
 * @notice This contract is only for X Layer chain.
 */
contract StakeStoneVaultAdapter is RouterIntentEoaAdapterWithoutDataProvider {
    using SafeERC20 for IERC20;

    address public immutable stone;
    address public immutable weth;
    IStakeStoneVault public immutable stakeStoneVault;

    constructor(
        address __native,
        address __wnative,
        address __weth,
        address __stone,
        address __stakeStoneVault
    ) RouterIntentEoaAdapterWithoutDataProvider(__native, __wnative) {
        stone = __stone;
        weth = __weth;
        stakeStoneVault = IStakeStoneVault(__stakeStoneVault);
    }

    function name() public pure override returns (string memory) {
        return "StakeStoneVaultAdapter";
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
            IERC20(weth).safeTransferFrom(msg.sender, self(), _amount);
        } else if (_amount == type(uint256).max)
            _amount = IERC20(weth).balanceOf(address(this));

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
        IERC20(weth).safeIncreaseAllowance(address(stakeStoneVault), _amount);
        uint256 stoneAmount = stakeStoneVault.deposit(_amount, _recipient);

        tokens = new address[](2);
        tokens[0] = weth;
        tokens[1] = stone;

        logData = abi.encode(_recipient, _amount, stoneAmount);
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
