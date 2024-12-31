// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import {BeraStoneVault, DepositWrapper} from "./Interfaces.sol";
import {RouterIntentEoaAdapterWithoutDataProvider, EoaExecutorWithoutDataProvider} from "@routerprotocol/intents-core/contracts/RouterIntentEoaAdapter.sol";
import {Errors} from "@routerprotocol/intents-core/contracts/utils/Errors.sol";
import {IERC20, SafeERC20} from "../../../utils/SafeERC20.sol";

/**
 * @title StakeStoneBera
 * @author Ankush Kumar
 * @notice Staking Tokens on StakeStone Ethereum to receive beraSTONE.
 * @notice This contract is only for Ethereum chain.
 */
contract StakeStoneBera is RouterIntentEoaAdapterWithoutDataProvider {
    using SafeERC20 for IERC20;

    address public immutable beraSTONE;
    BeraStoneVault public immutable beraStoneVault;
    DepositWrapper public immutable depositWrapper;

    constructor(
        address __native,
        address __wnative,
        address __beraSTONE,
        address __beraStoneVault,
        address __depositWrapper
    ) RouterIntentEoaAdapterWithoutDataProvider(__native, __wnative) {
        beraSTONE = __beraSTONE;
        beraStoneVault = BeraStoneVault(__beraStoneVault);
        depositWrapper = DepositWrapper(__depositWrapper);
    }

    function name() public pure override returns (string memory) {
        return "StakeStoneBera";
    }

    /**
     * @inheritdoc EoaExecutorWithoutDataProvider
     */
    function execute(
        bytes calldata data
    ) external payable override returns (address[] memory tokens) {
        (address _token, address _recipient, uint256 _amount) = parseInputs(
            data
        );

        // If the adapter is called using `call` and not `delegatecall`
        if (address(this) == self()) {
            if (_token != native())
                IERC20(_token).safeTransferFrom(msg.sender, self(), _amount);
            else
                require(
                    msg.value == _amount,
                    Errors.INSUFFICIENT_NATIVE_FUNDS_PASSED
                );
        } else if (_amount == type(uint256).max)
            if (_token == native()) {
                _amount = address(this).balance;
            } else {
                _amount = IERC20(_token).balanceOf(address(this));
            }

        bytes memory logData;

        (tokens, logData) = _stake(_token, _recipient, _amount);

        emit ExecutionEvent(name(), logData);
        return tokens;
    }

    //////////////////////////// ACTION LOGIC ////////////////////////////

    function _stake(
        address _token,
        address _recipient,
        uint256 _amount
    ) internal returns (address[] memory tokens, bytes memory logData) {
        uint256 _receivedberaSTONE;
        if (_token == native()) {
            _receivedberaSTONE = depositWrapper.depositETH{
                        value: _amount
                    }(_recipient);
        } else {
            IERC20(_token).safeIncreaseAllowance(
                address(beraStoneVault),
                _amount
            );
            _receivedberaSTONE = beraStoneVault.deposit(
                _token,
                _amount,
                _recipient
            );
        }

        // uint256 _receivedberaSTONE = IERC20(beraSTONE).balanceOf(address(this));
        tokens = new address[](2);
        tokens[0] = _token;
        tokens[1] = beraSTONE;
        // withdrawTokens(beraSTONE, _recipient, type(uint256).max);
        logData = abi.encode(_recipient, _amount, _receivedberaSTONE);
    }

    /**
     * @dev function to parse input data.
     * @param data input data.
     */
    function parseInputs(
        bytes memory data
    ) public pure returns (address, address, uint256) {
        return abi.decode(data, (address, address, uint256));
    }

    // solhint-disable-next-line no-empty-blocks
    receive() external payable {}
}
