// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import {RouterIntentEoaAdapter, EoaExecutor} from "router-intents/contracts/RouterIntentEoaAdapter.sol";
import {Errors} from "../../Errors.sol";
import {IERC20, SafeERC20} from "../../utils/SafeERC20.sol";
import {IAssetForwarder} from "../../interfaces/IAssetForwarder.sol";
import {IDexSpan} from "../../interfaces/IDexSpan.sol";

/**
 * @title NitroAdapter
 * @author Shivam Agrawal
 * @notice Adapter for bridging funds and instructions to another chain.
 */
contract NitroAdapter is RouterIntentEoaAdapter {
    using SafeERC20 for IERC20;

    address public immutable assetForwarder;
    address public immutable dexspan;
    address public immutable usdc;
    uint256 public constant PARTNER_ID = 1;

    struct SwapAndDepositData {
        bytes32 destChainIdBytes;
        bytes recipient;
        address refundRecipient;
        uint256 destAmount;
        IDexSpan.SwapParams swapData;
        bytes message;
    }

    struct UsdcCCTPData {
        uint256 amount;
        bytes32 destChainIdBytes;
        bytes32 recipient;
    }

    constructor(
        address __native,
        address __wnative,
        address __assetForwarder,
        address __dexspan
    )
        RouterIntentEoaAdapter(__native, __wnative, false, address(0))
    // solhint-disable-next-line no-empty-blocks
    {
        assetForwarder = __assetForwarder;
        dexspan = __dexspan;
        usdc = IAssetForwarder(assetForwarder).usdc();
    }

    function name() public pure override returns (string memory) {
        return "NitroAdapter";
    }

    /**
     * @inheritdoc EoaExecutor
     */
    function execute(
        address,
        address,
        bytes calldata data
    ) external payable override returns (address[] memory tokens) {
        // txType = 1 -> assetForwarder iDeposit
        // txType = 2 -> dexspan swapAndDeposit
        // txType = 3 -> usdcRequest
        uint8 txType = abi.decode(data, (uint8));

        if (txType > 3) revert(Errors.INVALID_BRDIGE_TX_TYPE);

        address[] memory _tokens = new address[](1);

        if (txType == 1) {
            (
                ,
                IAssetForwarder.DepositData memory depositData,
                bytes memory destToken,
                bytes memory recipient,
                bytes memory message
            ) = abi.decode(
                    data,
                    (uint8, IAssetForwarder.DepositData, bytes, bytes, bytes)
                );

            depositData.partnerId = PARTNER_ID;

            if (address(depositData.srcToken) == native()) {
                if (address(this) == self())
                    require(
                        msg.value == depositData.amount,
                        Errors.INSUFFICIENT_NATIVE_FUNDS_PASSED
                    );
                else if (depositData.amount == type(uint256).max)
                    depositData.amount = address(this).balance;

                _tokens[0] = native();

                if (message.length == 0)
                    IAssetForwarder(assetForwarder).iDeposit{
                        value: depositData.amount
                    }(depositData, destToken, recipient);
                else
                    IAssetForwarder(assetForwarder).iDepositMessage{
                        value: depositData.amount
                    }(depositData, destToken, recipient, message);
            } else {
                if (address(this) == self())
                    IERC20(depositData.srcToken).safeTransferFrom(
                        msg.sender,
                        address(this),
                        depositData.amount
                    );
                else if (depositData.amount == type(uint256).max)
                    depositData.amount = IERC20(depositData.srcToken).balanceOf(
                        address(this)
                    );

                IERC20(depositData.srcToken).safeIncreaseAllowance(
                    assetForwarder,
                    depositData.amount
                );

                _tokens[0] = depositData.srcToken;

                if (message.length == 0)
                    IAssetForwarder(assetForwarder).iDeposit(
                        depositData,
                        destToken,
                        recipient
                    );
                else
                    IAssetForwarder(assetForwarder).iDepositMessage(
                        depositData,
                        destToken,
                        recipient,
                        message
                    );
            }
        } else if (txType == 2) {
            (
                ,
                SwapAndDepositData memory dexspanData,
                bytes memory message
            ) = abi.decode(data, (uint8, SwapAndDepositData, bytes));
            address srcToken = address(dexspanData.swapData.tokens[0]);
            uint256 amount = dexspanData.swapData.amount;

            if (address(this) == self()) {
                if (srcToken == native()) {
                    if (msg.value != amount)
                        revert(Errors.INSUFFICIENT_NATIVE_FUNDS_PASSED);
                } else {
                    IERC20(srcToken).safeTransferFrom(
                        msg.sender,
                        self(),
                        amount
                    );
                }
            } else if (amount == type(uint256).max) {
                if (srcToken == native()) {
                    amount = address(this).balance;
                } else {
                    amount = IERC20(srcToken).balanceOf(address(this));
                }
            }

            withdrawTokens(srcToken, dexspan, amount);

            dexspanData.swapData.amount = amount;
            dexspanData.swapData.isWrapper = true;

            _tokens[0] = srcToken;

            if (message.length == 0)
                IDexSpan(dexspan).swapAndDeposit(
                    PARTNER_ID,
                    dexspanData.destChainIdBytes,
                    dexspanData.recipient,
                    dexspanData.destAmount,
                    hex"",
                    false,
                    dexspanData.swapData,
                    dexspanData.refundRecipient
                );
            else
                IDexSpan(dexspan).swapAndDeposit(
                    PARTNER_ID,
                    dexspanData.destChainIdBytes,
                    dexspanData.recipient,
                    dexspanData.destAmount,
                    message,
                    true,
                    dexspanData.swapData,
                    dexspanData.refundRecipient
                );
        } else {
            (, UsdcCCTPData memory usdcData) = abi.decode(
                data,
                (uint8, UsdcCCTPData)
            );

            if (address(this) == self())
                IERC20(usdc).safeTransferFrom(
                    msg.sender,
                    self(),
                    usdcData.amount
                );
            else if (usdcData.amount == type(uint256).max)
                usdcData.amount = IERC20(usdc).balanceOf(address(this));

            IERC20(usdc).safeIncreaseAllowance(assetForwarder, usdcData.amount);

            _tokens[0] = usdc;

            IAssetForwarder(assetForwarder).iDepositUSDC(
                PARTNER_ID,
                usdcData.destChainIdBytes,
                usdcData.recipient,
                usdcData.amount
            );
        }

        emit ExecutionEvent(name(), data);
        return _tokens;
    }
}
