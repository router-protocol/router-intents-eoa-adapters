// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import {MendiHelpers} from "./MendiHelpers.sol";
import {ICERC20} from "./interfaces/ICERC20.sol";
import {RouterIntentEoaAdapterWithoutDataProvider, EoaExecutorWithoutDataProvider} from "@routerprotocol/intents-core/contracts/RouterIntentEoaAdapter.sol";
import {Errors} from "../../../Errors.sol";
import {IERC20, SafeERC20} from "../../../utils/SafeERC20.sol";
import {IWETH} from "../../../interfaces/IWETH.sol";

/**
 * @title MendiSupply
 * @author Shivam Agrawal
 * @notice Supplying funds on Mendi.
 */
contract MendiSupply is
    RouterIntentEoaAdapterWithoutDataProvider,
    MendiHelpers
{
    using SafeERC20 for IERC20;

    constructor(
        address __native,
        address __wnative,
        address __usdc,
        address __usdt,
        address __dai,
        address __wbtc,
        address __wstEth,
        address __meWeth,
        address __meUsdc,
        address __meUsdt,
        address __meDai,
        address __meWbtc,
        address __meWstEth
    )
        RouterIntentEoaAdapterWithoutDataProvider(__native, __wnative)
        MendiHelpers(
            __usdc,
            __usdt,
            __dai,
            __wbtc,
            __wstEth,
            __meWeth,
            __meUsdc,
            __meUsdt,
            __meDai,
            __meWbtc,
            __meWstEth
        )
    // solhint-disable-next-line no-empty-blocks
    {

    }

    function name() public pure override returns (string memory) {
        return "MendiSupply";
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

        (tokens, logData) = _mendiSupply(_asset, _recipient, _amount);

        emit ExecutionEvent(name(), logData);
        return tokens;
    }

    //////////////////////////// ACTION LOGIC ////////////////////////////

    /**
     * @notice function to supply funds to Mendi.
     * @param amount Amount of supply asset to be supplied.
     * @param recipient Recipient of aTokens after funds have been supplied.
     * @param asset Asset to be supplied.
     */
    function _mendiSupply(
        address asset,
        address recipient,
        uint256 amount
    ) private returns (address[] memory tokens, bytes memory logData) {
        if (asset == native()) {
            IWETH(wnative()).deposit{value: amount}();
            asset = wnative();
        }

        ICERC20 _meToken;

        if (asset == usdc) {
            _meToken = meUsdc;
        } else if (asset == wnative()) {
            _meToken = meWeth;
        } else if (asset == usdt) {
            _meToken = meUsdt;
        } else if (asset == dai) {
            _meToken = meDai;
        } else if (asset == wbtc) {
            _meToken = meWbtc;
        } else if (asset == wstEth) {
            _meToken = meWstEth;
        } else revert InvalidSupplyMarket();

        uint256 balBefore = IERC20(address(_meToken)).balanceOf(address(this));

        IERC20(asset).safeIncreaseAllowance(address(_meToken), amount);
        _meToken.mint(amount);

        uint256 amountReceived = IERC20(address(_meToken)).balanceOf(
            address(this)
        ) - balBefore;

        if (amountReceived == 0) revert(Errors.ZERO_AMOUNT_RECEIVED);

        if (recipient != address(this))
            IERC20(address(_meToken)).transfer(recipient, amountReceived);

        tokens = new address[](2);
        tokens[0] = asset;
        tokens[1] = address(_meToken);

        logData = abi.encode(asset, recipient, recipient);
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
