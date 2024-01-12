// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

import {IFraxEthMinter} from "./Interfaces.sol";
import {RouterIntentEoaAdapter, EoaExecutor} from "router-intents/contracts/RouterIntentEoaAdapter.sol";
import {Errors} from "../../../Errors.sol";
import {IERC20, SafeERC20} from "../../../utils/SafeERC20.sol";

/**
 * @title FraxStakeEth
 * @author Yashika Goyal
 * @notice Staking ETH to receive fraxETH or stakedFraxETH on Frax.
 * @notice This contract is only for Ethereum chain.
 */
contract FraxStakeEth is RouterIntentEoaAdapter {
    using SafeERC20 for IERC20;

    IFraxEthMinter public immutable fraxEthMinter;
    address public immutable fraxEth;
    address public immutable stakedFraxEth;

    error InvalidTxType();

    constructor(
        address __native,
        address __wnative,
        address __fraxEth,
        address __stakedFraxEth,
        address __fraxEthMinter
    ) RouterIntentEoaAdapter(__native, __wnative, false, address(0)) {
        fraxEth = __fraxEth;
        stakedFraxEth = __stakedFraxEth;
        fraxEthMinter = IFraxEthMinter(__fraxEthMinter);
    }

    function name() public pure override returns (string memory) {
        return "FraxStakeEth";
    }

    /**
     * @inheritdoc EoaExecutor
     */
    function execute(
        address,
        address,
        bytes calldata data
    ) external payable override returns (address[] memory tokens) {
        (address _recipient, uint256 _amount, uint256 _txType) = parseInputs(
            data
        );

        // If the adapter is called using `call` and not `delegatecall`
        if (address(this) == self()) {
            require(
                msg.value == _amount,
                Errors.INSUFFICIENT_NATIVE_FUNDS_PASSED
            );
        } else if (_amount == type(uint256).max)
            _amount = address(this).balance;

        bytes memory logData;

        (tokens, logData) = _stake(_recipient, _amount, _txType);

        emit ExecutionEvent(name(), logData);
        return tokens;
    }

    //////////////////////////// ACTION LOGIC ////////////////////////////

    /**
     * @notice function to stake funds on Frax ETH Pool.
     * @param _recipient address of the recipient.
     * @param _amount amount to be staked.
     * @param _txType Type of transaction.
     * 1 for staking Eth to get frxEth.
     * 2 for staking Eth and then staking frxEth to get sFrxEth.
     */

    function _stake(
        address _recipient,
        uint256 _amount,
        uint256 _txType
    ) internal returns (address[] memory tokens, bytes memory logData) {
        if (_txType == 1) {
            fraxEthMinter.submitAndGive{value: _amount}(_recipient);
            tokens = new address[](2);
            tokens[0] = native();
            tokens[1] = fraxEth;
            logData = abi.encode(_recipient, fraxEth, _amount);
        } else if (_txType == 2) {
            uint256 _receivedSFrxEth = fraxEthMinter.submitAndDeposit{
                value: _amount
            }(_recipient);
            tokens = new address[](2);
            tokens[0] = native();
            tokens[1] = stakedFraxEth;
            logData = abi.encode(_recipient, stakedFraxEth, _receivedSFrxEth);
        } else {
            revert InvalidTxType();
        }
    }

    /**
     * @dev function to parse input data.
     * @param data input data.
     */
    function parseInputs(
        bytes memory data
    ) public pure returns (address, uint256, uint256) {
        return abi.decode(data, (address, uint256, uint256));
    }

    // solhint-disable-next-line no-empty-blocks
    receive() external payable {}
}
