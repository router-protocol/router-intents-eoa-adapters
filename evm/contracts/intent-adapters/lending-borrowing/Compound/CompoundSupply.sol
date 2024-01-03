// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

import {CompoundHelpers} from "./CompoundHelpers.sol";
import {IComet} from "./interfaces/IComet.sol";
import {RouterIntentEoaAdapter, EoaExecutor} from "router-intents/contracts/RouterIntentEoaAdapter.sol";
import {NitroMessageHandler} from "router-intents/contracts/utils/NitroMessageHandler.sol";
import {Errors} from "router-intents/contracts/utils/Errors.sol";
import {IERC20, SafeERC20} from "../../../utils/SafeERC20.sol";
import {IWETH} from "../../../interfaces/IWETH.sol";

/**
 * @title CompoundSupply
 * @author Yashika Goyal
 * @notice Supplying funds on Compound.
 */
contract CompoundSupply is
    RouterIntentEoaAdapter,
    NitroMessageHandler,
    CompoundHelpers
{
    using SafeERC20 for IERC20;

    event CompoundSupplyDest(
        address _token,
        address _recipient,
        uint256 _amount
    );

    constructor(
        address __native,
        address __wnative,
        address __owner,
        address __assetForwarder,
        address __dexspan,
        address __usdc,
        address __cUSDCV3Pool,
        address __cWETHV3Pool
    )
        RouterIntentEoaAdapter(__native, __wnative, __owner)
        NitroMessageHandler(__assetForwarder, __dexspan)
        CompoundHelpers(__usdc, __cUSDCV3Pool, __cWETHV3Pool)
    // solhint-disable-next-line no-empty-blocks
    {

    }

    function name() public pure override returns (string memory) {
        return "CompoundSupply";
    }

    /**
     * @inheritdoc EoaExecutor
     */
    function execute(
        address,
        address,
        bytes calldata data
    ) external payable override returns (address[] memory tokens) {
        (
            address _asset,
            address _recipient,
            uint256 _amount,
            address _market
        ) = parseInputs(data);

        // If the adapter is called using `call` and not `delegatecall`
        if (address(this) == self()) {
            if (_asset == native())
                require(
                    msg.value == _amount,
                    Errors.INSUFFICIENT_NATIVE_FUNDS_PASSED
                );
            else IERC20(_asset).safeTransferFrom(msg.sender, self(), _amount);
        }

        bytes memory logData;

        (tokens, logData) = _compoundSupply(
            _asset,
            _recipient,
            _amount,
            _market
        );

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
        (address recipient, address market) = abi.decode(
            instruction,
            (address, address)
        );

        IComet _cTokenV3Pool;

        if (market == usdc()) {
            _cTokenV3Pool = cUSDCV3Pool();
        } else if (market == wnative()) {
            _cTokenV3Pool = cWETHV3Pool();
        } else {
            withdrawTokens(tokenSent, recipient, amount);
            emit OperationFailedRefundEvent(tokenSent, recipient, amount);
            return;
        }

        approveToken(tokenSent, address(_cTokenV3Pool), amount);
        uint256 supplyAmount = amount;

        if (tokenSent == native()) {
            if (wnative() == _cTokenV3Pool.baseToken()) {
                if (amount == type(uint256).max)
                    supplyAmount = _cTokenV3Pool.borrowBalanceOf(msg.sender);
            }
            IWETH(wnative()).deposit{value: supplyAmount}();
            IWETH(wnative()).approve(address(_cTokenV3Pool), supplyAmount);

            try _cTokenV3Pool.supplyTo(recipient, wnative(), supplyAmount) {
                emit CompoundSupplyDest(native(), recipient, amount);
            } catch {
                withdrawTokens(native(), recipient, amount);
                emit OperationFailedRefundEvent(native(), recipient, amount);
            }
        } else
            try _cTokenV3Pool.supplyTo(recipient, tokenSent, amount) {
                emit CompoundSupplyDest(tokenSent, recipient, amount);
            } catch {
                withdrawTokens(tokenSent, recipient, amount);
                emit OperationFailedRefundEvent(tokenSent, recipient, amount);
            }
    }

    //////////////////////////// ACTION LOGIC ////////////////////////////

    /**
     * @notice function to supply funds to Compound.
     * @param market Address of USDC/WETH address to specify the supply-borrow market to enter.
     * @param amount Amount of supply asset to be supplied.
     * @param recipient Recipient of aTokens after funds have been supplied.
     * @param asset Asset to be supplied.
     */
    function _compoundSupply(
        address asset,
        address recipient,
        uint256 amount,
        address market
    ) private returns (address[] memory tokens, bytes memory logData) {
        IComet _cTokenV3Pool;

        if (market == usdc()) {
            _cTokenV3Pool = cUSDCV3Pool();
        } else if (market == wnative()) {
            _cTokenV3Pool = cWETHV3Pool();
        } else revert InvalidSupplyMarket();

        approveToken(asset, address(_cTokenV3Pool), amount);

        uint256 supplyAmount = amount;

        if (asset == native()) {
            if (wnative() == _cTokenV3Pool.baseToken()) {
                if (amount == type(uint256).max)
                    supplyAmount = _cTokenV3Pool.borrowBalanceOf(msg.sender);
            }
            IWETH(wnative()).deposit{value: supplyAmount}();
            IWETH(wnative()).approve(address(_cTokenV3Pool), supplyAmount);

            _cTokenV3Pool.supplyTo(recipient, wnative(), supplyAmount);
        } else _cTokenV3Pool.supplyTo(recipient, asset, amount);

        tokens = new address[](1);
        tokens[0] = asset;

        logData = abi.encode(asset, recipient, recipient, market);
    }

    /**
     * @dev function to parse input data.
     * @param data input data.
     */
    function parseInputs(
        bytes memory data
    ) public pure returns (address, address, uint256, address) {
        return abi.decode(data, (address, address, uint256, address));
    }

    // solhint-disable-next-line no-empty-blocks
    receive() external payable {}
}
