// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import {ILayerBankCore} from "./interfaces/ILayerBankCore.sol";
import {RouterIntentEoaAdapterWithoutDataProvider, EoaExecutorWithoutDataProvider} from "@routerprotocol/intents-core/contracts/RouterIntentEoaAdapter.sol";
import {Errors} from "@routerprotocol/intents-core/contracts/utils/Errors.sol";
import {IERC20, SafeERC20} from "../../../utils/SafeERC20.sol";
import {SafeMath} from "../../../utils/SafeMath.sol";

/**
 * @title LayerBankSupply
 * @author Yashika Goyal
 * @notice Supplying funds on LayerBank.
 * @notice This contract is only for Scroll chain.
 */

contract LayerBankSupplyScroll is RouterIntentEoaAdapterWithoutDataProvider {
    using SafeERC20 for IERC20;
    using SafeMath for uint256;

    ILayerBankCore public immutable layerBankCore;
    address public immutable usdc;
    address public immutable wstEth;
    address public immutable lETh = 0x274C3795dadfEbf562932992bF241ae087e0a98C;
    address public immutable lUsdc = 0x0D8F8e271DD3f2fC58e5716d3Ff7041dBe3F0688;
    address public immutable lWstEth = 0xB6966083c7b68175B4BF77511608AEe9A80d2Ca4;

    constructor(
        address __native,
        address __wnative,
        address __layerBankCore,
        address __usdc,
        address __wstEth
    )
        RouterIntentEoaAdapterWithoutDataProvider(__native, __wnative)
    // solhint-disable-next-line no-empty-blocks
    {
        layerBankCore = ILayerBankCore(__layerBankCore);
        usdc = __usdc;
        wstEth = __wstEth;
    }

    function name() public pure override returns (string memory) {
        return "LayerBankSupply";
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
            if (_asset == native())
                require(
                    msg.value == _amount,
                    Errors.INSUFFICIENT_NATIVE_FUNDS_PASSED
                );
            else IERC20(_asset).safeTransferFrom(msg.sender, self(), _amount);
        } else if (_amount == type(uint256).max)
            _amount = getBalance(_asset, address(this));

        bytes memory logData;

        (tokens, logData) = _layerBankSupply(_asset, _recipient, _amount);

        emit ExecutionEvent(name(), logData);
        return tokens;
    }

    //////////////////////////// ACTION LOGIC ////////////////////////////

    /**
     * @notice function to supply funds to LayerBank.
     * @param amount Amount of supply asset to be supplied.
     * @param recipient Recipient of aTokens after funds have been supplied.
     * @param asset Asset to be supplied.
     */
    function _layerBankSupply(
        address asset,
        address recipient,
        uint256 amount
    ) private returns (address[] memory tokens, bytes memory logData) {
        address lToken;
        if(asset == native()) lToken = lETh;
        else if (asset == usdc) lToken = lUsdc;
        else if (asset == wstEth) lToken = lWstEth;

        uint256 lTokenAmountBefore = getBalance(lToken, address(this));

        if (asset == native()) layerBankCore.supply{value: amount}(lETh, amount);
        else {
            IERC20(asset).safeIncreaseAllowance(lToken, amount);
            layerBankCore.supply(lToken, amount);
        }

        uint256 lTokenAmountReceived = getBalance(lToken, address(this)).sub(
            lTokenAmountBefore
        );

        withdrawTokens(lToken, recipient, lTokenAmountReceived);

        tokens = new address[](2);
        tokens[0] = asset;
        tokens[1] = lToken;

        logData = abi.encode(asset, recipient, amount);
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
