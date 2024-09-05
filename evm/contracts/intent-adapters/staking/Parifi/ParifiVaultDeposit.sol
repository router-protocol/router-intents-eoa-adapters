// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import {IParifiVault} from "./Interfaces.sol";
import {RouterIntentEoaAdapterWithoutDataProvider, EoaExecutorWithoutDataProvider} from "@routerprotocol/intents-core/contracts/RouterIntentEoaAdapter.sol";
import {Errors} from "@routerprotocol/intents-core/contracts/utils/Errors.sol";
import {IERC20, SafeERC20} from "../../../utils/SafeERC20.sol";

/**
 * @title ParifiVaultDeposit
 * @author Yashika Goyal
 * @notice Depositing USDC/WETH on Parifi for pfUSDC/pfWETH.
 */
contract ParifiVaultDeposit is RouterIntentEoaAdapterWithoutDataProvider {
    using SafeERC20 for IERC20;

    address public immutable usdc;
    address public immutable weth;
    IParifiVault public immutable pfUsdc;
    IParifiVault public immutable pfWeth;

    error InvalidVault();

    constructor(
        address __native,
        address __wnative,
        address __usdc,
        address __pfUsdc,
        address __pfWeth
    ) RouterIntentEoaAdapterWithoutDataProvider(__native, __wnative) {
        usdc = __usdc;
        weth = __wnative;
        pfUsdc = IParifiVault(__pfUsdc);
        pfWeth = IParifiVault(__pfWeth);
    }

    function name() public pure override returns (string memory) {
        return "ParifiVaultDeposit";
    }

    /**
     * @inheritdoc EoaExecutorWithoutDataProvider
     */
    function execute(
        bytes calldata data
    ) external payable override returns (address[] memory tokens) {
        (address _asset, address _recipient, uint256 _amount) = parseInputs(
            data
        );

        // If the adapter is called using `call` and not `delegatecall`
        if (address(this) == self()) {
            if (_asset != native())
                IERC20(_asset).safeTransferFrom(msg.sender, self(), _amount);
            else
                require(
                    msg.value == _amount,
                    Errors.INSUFFICIENT_NATIVE_FUNDS_PASSED
                );
        } else {
            if (_amount == type(uint256).max)
                _amount = getBalance(_asset, address(this));
        }

        if (_asset == native()) {
            convertNativeToWnative(_amount);
            _asset = wnative();
        }

        bytes memory logData;

        (tokens, logData) = _stake(_asset, _recipient, _amount);

        emit ExecutionEvent(name(), logData);
        return tokens;
    }

    //////////////////////////// ACTION LOGIC ////////////////////////////

    function _stake(
        address _asset,
        address _recipient,
        uint256 _amount
    ) internal returns (address[] memory tokens, bytes memory logData) {
        IParifiVault vault;
        if (_asset == usdc) {
            vault = pfUsdc;
        } else if (_asset == weth) {
            vault = pfWeth;
        } else revert InvalidVault();
        IERC20(_asset).safeIncreaseAllowance(address(vault), _amount);
        vault.deposit(_amount, _recipient);

        tokens = new address[](2);
        tokens[0] = _asset;
        tokens[1] = address(vault);

        logData = abi.encode(_recipient, _amount);
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
