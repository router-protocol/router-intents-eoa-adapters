// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import {RouterIntentEoaAdapterWithoutDataProvider, EoaExecutorWithoutDataProvider} from "@routerprotocol/intents-core/contracts/RouterIntentEoaAdapter.sol";
import {Errors} from "../../Errors.sol";
import {IERC20, SafeERC20} from "../../utils/SafeERC20.sol";
import {IAssetBridge} from "../../interfaces/IAssetBridge.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract AssetBridgeDataStore is Ownable {
    address public assetBridge;

    constructor(address _owner, address _assetBridge) {
        _transferOwnership(_owner);
        assetBridge = _assetBridge;
    }

    function setAssetBridge(address _assetBridge) external onlyOwner {
        assetBridge = _assetBridge;
    }
}

/**
 * @title AssetBridgeAdapter
 * @author Yashika Goyal
 * @notice Adapter for bridging funds and instructions to another chain.
 */
contract AssetBridgeAdapter is RouterIntentEoaAdapterWithoutDataProvider {
    using SafeERC20 for IERC20;

    AssetBridgeDataStore public immutable assetBridgeDataStore;
    uint256 public constant PARTNER_ID = 1;

    constructor(
        address __native,
        address __wnative,
        address __assetBridge
    )
        RouterIntentEoaAdapterWithoutDataProvider(__native, __wnative)
    // solhint-disable-next-line no-empty-blocks
    {
        assetBridgeDataStore = new AssetBridgeDataStore(
            msg.sender,
            __assetBridge
        );
    }

    function name() public pure override returns (string memory) {
        return "AssetBridgeAdapter";
    }

    /**
     * @inheritdoc EoaExecutorWithoutDataProvider
     */
    function execute(
        bytes calldata data
    ) external payable override returns (address[] memory tokens) {
        // txType = 0 -> assetBridge transferToken
        // txType = 1 -> assetBridge swapAndTransferToken
        uint8 txType = abi.decode(data, (uint8));

        if (txType > 1) revert(Errors.INVALID_ASSET_BRDIGE_TX_TYPE);

        address[] memory _tokens = new address[](1);

        if (txType == 0) {
            (
                ,
                IAssetBridge.TransferPayload memory transferPayload,
                uint64 destGasLimit,
                bytes memory instruction
            ) = abi.decode(
                    data,
                    (uint8, IAssetBridge.TransferPayload, uint64 , bytes)
                );

            address assetBridge = assetBridgeDataStore.assetBridge();

            if (address(transferPayload.srcTokenAddress) == native()) {
                if (address(this) == self())
                    require(
                        msg.value == transferPayload.srcTokenAmount,
                        Errors.INSUFFICIENT_NATIVE_FUNDS_PASSED
                    );
                else if (transferPayload.srcTokenAmount == type(uint256).max)
                    transferPayload.srcTokenAmount = address(this).balance;

                _tokens[0] = native();

                if (instruction.length == 0) {
                    IAssetBridge(assetBridge).transferToken{
                        value: transferPayload.srcTokenAmount
                    }(transferPayload);
                } else
                    IAssetBridge(assetBridge).transferTokenWithInstruction{
                        value: transferPayload.srcTokenAmount
                    }(transferPayload, destGasLimit, instruction);
            } else {
                if (address(this) == self())
                    IERC20(transferPayload.srcTokenAddress).safeTransferFrom(
                        msg.sender,
                        address(this),
                        transferPayload.srcTokenAmount
                    );
                else if (transferPayload.srcTokenAmount == type(uint256).max)
                    transferPayload.srcTokenAmount = IERC20(transferPayload.srcTokenAddress).balanceOf(
                        address(this)
                    );

                IERC20(transferPayload.srcTokenAddress).safeIncreaseAllowance(
                    assetBridge,
                    transferPayload.srcTokenAmount
                );

                _tokens[0] = transferPayload.srcTokenAddress;

                if (instruction.length == 0)
                    IAssetBridge(assetBridge).transferToken(
                        transferPayload
                    );
                else
                    IAssetBridge(assetBridge).transferTokenWithInstruction(
                        transferPayload,
                        destGasLimit,
                        instruction
                    );
            }
        } else {
            (
                ,
                IAssetBridge.SwapTransferPayload memory swapTransferPayload,
                uint64 destGasLimit,
                bytes memory instruction
            ) = abi.decode(data, (uint8, IAssetBridge.SwapTransferPayload, uint64, bytes));

            address assetBridge = assetBridgeDataStore.assetBridge();

            if (address(swapTransferPayload.tokens[0]) == native()) {
                if (address(this) == self())
                    require(
                        msg.value == swapTransferPayload.srcTokenAmount,
                        Errors.INSUFFICIENT_NATIVE_FUNDS_PASSED
                    );
                else if (swapTransferPayload.srcTokenAmount == type(uint256).max)
                    swapTransferPayload.srcTokenAmount = address(this).balance;

                _tokens[0] = native();

                if (instruction.length == 0) {
                    IAssetBridge(assetBridge).swapAndTransferToken{
                        value: swapTransferPayload.srcTokenAmount
                    }(swapTransferPayload);
                } else
                    IAssetBridge(assetBridge).swapAndTransferTokenWithInstruction{
                        value: swapTransferPayload.srcTokenAmount
                    }(swapTransferPayload, destGasLimit, instruction);
            } else {
                if (address(this) == self())
                    IERC20(swapTransferPayload.tokens[0]).safeTransferFrom(
                        msg.sender,
                        address(this),
                        swapTransferPayload.srcTokenAmount
                    );
                else if (swapTransferPayload.srcTokenAmount == type(uint256).max)
                    swapTransferPayload.srcTokenAmount = IERC20(swapTransferPayload.tokens[0]).balanceOf(
                        address(this)
                    );

                IERC20(swapTransferPayload.tokens[0]).safeIncreaseAllowance(
                    assetBridge,
                    swapTransferPayload.srcTokenAmount
                );

                _tokens[0] = swapTransferPayload.tokens[0];

                if (instruction.length == 0)
                    IAssetBridge(assetBridge).swapAndTransferToken(
                        swapTransferPayload
                    );
                else
                    IAssetBridge(assetBridge).swapAndTransferTokenWithInstruction(
                        swapTransferPayload,
                        destGasLimit,
                        instruction
                    );
            }
        }
        emit ExecutionEvent(name(), data);
        return _tokens;
    }
}
