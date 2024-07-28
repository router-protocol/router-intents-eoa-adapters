// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import {RouterIntentEoaAdapterWithoutDataProvider, EoaExecutorWithoutDataProvider} from "@routerprotocol/intents-core/contracts/RouterIntentEoaAdapter.sol";
import {Errors} from "../../Errors.sol";
import {IERC20, SafeERC20} from "../../utils/SafeERC20.sol";
import {IAssetForwarder} from "../../interfaces/IAssetForwarder.sol";
import {IDexSpan} from "../../interfaces/IDexSpan.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract NitroDataStore is Ownable {
    address public assetForwarder;
    address public dexspan;

    constructor(address _owner, address _assetForwarder, address _dexspan) {
        _transferOwnership(_owner);
        assetForwarder = _assetForwarder;
        dexspan = _dexspan;
    }

    function setDexSpan(address _dexspan) external onlyOwner {
        dexspan = _dexspan;
    }

    function setAssetForwarder(address _assetForwarder) external onlyOwner {
        assetForwarder = _assetForwarder;
    }
}

/**
 * @title NitroAdapter
 * @author Shivam Agrawal
 * @notice Adapter for bridging funds and instructions to another chain.
 */
contract NitroAdapterXLayer is RouterIntentEoaAdapterWithoutDataProvider {
    using SafeERC20 for IERC20;

    NitroDataStore public immutable nitroDataStore;
    uint256 public constant PARTNER_ID = 1;

    struct SwapAndDepositData {
        uint256 partnerId;
        bytes32 destChainIdBytes;
        bytes recipient;
        address refundRecipient;
        uint256 feeAmount;
        IDexSpan.SwapParams swapData;
        bytes message;
    }

    constructor(
        address __native,
        address __wnative,
        address __assetForwarder,
        address __dexspan
    )
        RouterIntentEoaAdapterWithoutDataProvider(__native, __wnative)
    // solhint-disable-next-line no-empty-blocks
    {
        nitroDataStore = new NitroDataStore(
            msg.sender,
            __assetForwarder,
            __dexspan
        );
    }

    function name() public pure override returns (string memory) {
        return "NitroAdapterXLayer";
    }

    /**
     * @inheritdoc EoaExecutorWithoutDataProvider
     */
    function execute(
        bytes calldata data
    ) external payable override returns (address[] memory tokens) {
        // txType = 0 -> assetForwarder iDeposit
        // txType = 1 -> dexspan swapAndDeposit
        uint8 txType = abi.decode(data, (uint8));

        if (txType > 3) revert(Errors.INVALID_BRDIGE_TX_TYPE);

        address[] memory _tokens = new address[](1);

        if (txType == 0) {
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

            address assetForwarder = nitroDataStore.assetForwarder();

            if (address(depositData.srcToken) == native()) {
                if (address(this) == self())
                    require(
                        msg.value == depositData.amount,
                        Errors.INSUFFICIENT_NATIVE_FUNDS_PASSED
                    );
                else if (depositData.amount == type(uint256).max)
                    depositData.amount = address(this).balance;

                _tokens[0] = native();

                if (message.length == 0) {
                    IAssetForwarder(assetForwarder).iDeposit{
                        value: depositData.amount
                    }(depositData, destToken, recipient);
                } else
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
        } else if (txType == 1) {
            (
                ,
                SwapAndDepositData memory dexspanData,
                bytes memory message
            ) = abi.decode(data, (uint8, SwapAndDepositData, bytes));

            address dexspan = nitroDataStore.dexspan();

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
                    dexspanData.partnerId,
                    dexspanData.destChainIdBytes,
                    dexspanData.recipient,
                    0,
                    dexspanData.feeAmount,
                    hex"",
                    dexspanData.swapData,
                    dexspanData.refundRecipient
                );
            else
                IDexSpan(dexspan).swapAndDeposit(
                    dexspanData.partnerId,
                    dexspanData.destChainIdBytes,
                    dexspanData.recipient,
                    1,
                    dexspanData.feeAmount,
                    message,
                    dexspanData.swapData,
                    dexspanData.refundRecipient
                );
        } else {
            address assetForwarder = nitroDataStore.assetForwarder();
            address dexspan = nitroDataStore.dexspan();

            (, SwapAndDepositData memory dexspanData) = abi.decode(
                data,
                (uint8, SwapAndDepositData)
            );

            IAssetForwarder.DestDetails memory destDetails = IAssetForwarder(
                assetForwarder
            ).destDetails(dexspanData.destChainIdBytes);

            if (!destDetails.isSet) revert(Errors.INVALID_REQUEST);

            address srcToken = address(dexspanData.swapData.tokens[0]);
            uint256 amount = dexspanData.swapData.amount;

            if (address(this) == self()) {
                if (srcToken == native()) {
                    if (msg.value != amount + destDetails.fee)
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
                    amount = address(this).balance - destDetails.fee;
                } else {
                    amount = IERC20(srcToken).balanceOf(address(this));
                }
            }

            withdrawTokens(srcToken, dexspan, amount);

            dexspanData.swapData.amount = amount;
            dexspanData.swapData.isWrapper = true;

            _tokens[0] = srcToken;

            IDexSpan(dexspan).swapAndDeposit{value: destDetails.fee}(
                dexspanData.partnerId,
                dexspanData.destChainIdBytes,
                dexspanData.recipient,
                2,
                dexspanData.feeAmount,
                hex"",
                dexspanData.swapData,
                dexspanData.refundRecipient
            );
        }

        emit ExecutionEvent(name(), data);
        return _tokens;
    }
}
