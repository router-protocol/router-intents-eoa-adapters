// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

import {IFraxEthMinter} from "./Interfaces.sol";
import {RouterIntentEoaAdapter, EoaExecutor} from "router-intents/contracts/RouterIntentEoaAdapter.sol";
import {NitroMessageHandler} from "router-intents/contracts/utils/NitroMessageHandler.sol";
import {Errors} from "router-intents/contracts/utils/Errors.sol";
import {IERC20, SafeERC20} from "../../../utils/SafeERC20.sol";

/**
 * @title FraxStakeEth
 * @author Yashika Goyal
 * @notice Staking ETH to receive fraxETH or stakedFraxETH on Frax.
 * @notice This contract is only for Ethereum chain.
 */
contract FraxStakeEth is RouterIntentEoaAdapter, NitroMessageHandler {
    using SafeERC20 for IERC20;

    IFraxEthMinter private immutable _fraxEthMinter;
    address private immutable _fraxEth;
    address private immutable _stakedFraxEth;

    event FraxStakeEthDest(
        address _recipient,
        address token,
        uint256 _returnAmount
    );

    error InvalidTxType();

    constructor(
        address __native,
        address __wnative,
        address __owner,
        address __assetForwarder,
        address __dexspan,
        address __fraxEth,
        address __stakedFraxEth,
        address __fraxEthMinter
    )
        RouterIntentEoaAdapter(__native, __wnative, __owner)
        NitroMessageHandler(__assetForwarder, __dexspan)
    {
        _fraxEth = __fraxEth;
        _stakedFraxEth = __stakedFraxEth;
        _fraxEthMinter = IFraxEthMinter(__fraxEthMinter);
    }

    function fraxEth() public view returns (address) {
        return _fraxEth;
    }

    function stakedFraxEth() public view returns (address) {
        return _stakedFraxEth;
    }

    function fraxEthMinter() public view returns (IFraxEthMinter) {
        return _fraxEthMinter;
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
        }

        bytes memory logData;

        (tokens, logData) = _stake(_recipient, _amount, _txType);

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
        (address recipient, uint256 txType) = abi.decode(
            instruction,
            (address, uint256)
        );

        if (tokenSent != native()) {
            withdrawTokens(tokenSent, recipient, amount);
            emit OperationFailedRefundEvent(tokenSent, recipient, amount);
            return;
        }

        if (txType == 1) {
            try _fraxEthMinter.submitAndGive{value: amount}(recipient) {
                emit FraxStakeEthDest(recipient, _fraxEth, amount);
            } catch {
                withdrawTokens(tokenSent, recipient, amount);
                emit OperationFailedRefundEvent(tokenSent, recipient, amount);
            }
        } else if (txType == 2) {
            try
                _fraxEthMinter.submitAndDeposit{value: amount}(recipient)
            returns (uint256 _receivedSFrxEth) {
                emit FraxStakeEthDest(
                    recipient,
                    _stakedFraxEth,
                    _receivedSFrxEth
                );
            } catch {
                withdrawTokens(tokenSent, recipient, amount);
                emit OperationFailedRefundEvent(tokenSent, recipient, amount);
            }
        } else {
            revert InvalidTxType();
        }
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
            _fraxEthMinter.submitAndGive{value: _amount}(_recipient);
            tokens = new address[](2);
            tokens[0] = native();
            tokens[1] = fraxEth();
            logData = abi.encode(_recipient, _fraxEth, _amount);
        } else if (_txType == 2) {
            uint256 _receivedSFrxEth = _fraxEthMinter.submitAndDeposit{
                value: _amount
            }(_recipient);
            tokens = new address[](2);
            tokens[0] = native();
            tokens[1] = stakedFraxEth();
            logData = abi.encode(_recipient, _stakedFraxEth, _receivedSFrxEth);
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
