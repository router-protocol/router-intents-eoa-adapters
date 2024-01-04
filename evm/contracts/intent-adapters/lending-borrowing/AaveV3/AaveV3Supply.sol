// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

import {AaveV3Helpers} from "./AaveV3Helpers.sol";
import {RouterIntentEoaAdapter, EoaExecutor} from "router-intents/contracts/RouterIntentEoaAdapter.sol";
import {NitroMessageHandler} from "router-intents/contracts/utils/NitroMessageHandler.sol";
import {Errors} from "router-intents/contracts/utils/Errors.sol";
import {IERC20, SafeERC20} from "../../../utils/SafeERC20.sol";

/**
 * @title AaveV3Supply
 * @author Shivam Agrawal
 * @notice Supplying funds on AaveV3.
 */
contract AaveV3Supply is
    RouterIntentEoaAdapter,
    NitroMessageHandler,
    AaveV3Helpers
{
    using SafeERC20 for IERC20;

    event AaveV3SupplyDest(address _token, address _recipient, uint256 _amount);

    constructor(
        address __native,
        address __wnative,
        address __owner,
        address __assetForwarder,
        address __dexspan,
        address __aaveV3Pool,
        address __aaveV3WrappedTokenGateway,
        uint16 __aaveV3ReferralCode
    )
        RouterIntentEoaAdapter(__native, __wnative, __owner)
        NitroMessageHandler(__assetForwarder, __dexspan)
        AaveV3Helpers(
            __aaveV3Pool,
            __aaveV3WrappedTokenGateway,
            __aaveV3ReferralCode
        )
    // solhint-disable-next-line no-empty-blocks
    {

    }

    function name() public pure override returns (string memory) {
        return "AaveV3Supply";
    }

    /**
     * @inheritdoc EoaExecutor
     */
    function execute(
        address,
        address,
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
        }

        bytes memory logData;

        (tokens, logData) = _aaveV3Supply(_asset, _recipient, _amount);

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
        address recipient = abi.decode(instruction, (address));

        approveToken(tokenSent, address(aaveV3Pool()), amount);

        if (tokenSent == native())
            try
                aaveV3WrappedTokenGateway().depositETH{value: amount}(
                    address(0),
                    recipient,
                    aaveV3ReferralCode()
                )
            {
                emit AaveV3SupplyDest(native(), recipient, amount);
            } catch {
                withdrawTokens(native(), recipient, amount);
                emit OperationFailedRefundEvent(native(), recipient, amount);
            }
        else
            try
                aaveV3Pool().supply(
                    tokenSent,
                    amount,
                    recipient,
                    aaveV3ReferralCode()
                )
            {
                emit AaveV3SupplyDest(tokenSent, recipient, amount);
            } catch {
                withdrawTokens(tokenSent, recipient, amount);
                emit OperationFailedRefundEvent(tokenSent, recipient, amount);
            }
    }

    //////////////////////////// ACTION LOGIC ////////////////////////////

    /**
     * @notice function to supply funds to AaveV3.
     * @param amount Amount of supply asset to be supplied.
     * @param recipient Recipient of aTokens after funds have been supplied.
     * @param asset Asset to be supplied.
     */
    function _aaveV3Supply(
        address asset,
        address recipient,
        uint256 amount
    ) private returns (address[] memory tokens, bytes memory logData) {
        approveToken(asset, address(aaveV3Pool()), amount);

        if (asset == native())
            aaveV3WrappedTokenGateway().depositETH{value: amount}(
                address(0),
                recipient,
                aaveV3ReferralCode()
            );
        else
            aaveV3Pool().supply(asset, amount, recipient, aaveV3ReferralCode());

        tokens = new address[](1);
        tokens[0] = asset;

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