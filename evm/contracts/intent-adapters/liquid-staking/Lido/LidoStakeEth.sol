// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import {ILidoStakeEth, ILidoArbitrumBridge, ILidoLineaBridge, ILidoOptBaseMan, ILidoZkSyncBridge, IWstEth, IZkSync, IScrollMessageQueue, ILidoScrollBridge} from "./Interfaces.sol";
import {RouterIntentEoaAdapterWithoutDataProvider, EoaExecutorWithoutDataProvider} from "@routerprotocol/intents-core/contracts/RouterIntentEoaAdapter.sol";
import {NitroMessageHandler} from "@routerprotocol/intents-core/contracts/utils/NitroMessageHandler.sol";
import {Errors} from "../../../Errors.sol";
import {IERC20, SafeERC20} from "../../../utils/SafeERC20.sol";

/**
 * @title LidoStakeEth
 * @author Yashika Goyal
 * @notice Staking ETH to receive StEth on Lido.
 * @notice This contract is only for Ethereum chain.
 */
contract LidoStakeEth is RouterIntentEoaAdapterWithoutDataProvider {
    using SafeERC20 for IERC20;

    address public immutable lidoStETH;
    address public immutable lidoWstEth;
    address public immutable referralId;
    ILidoArbitrumBridge public immutable arbitrumGateway;
    ILidoOptBaseMan public immutable baseGateway;
    ILidoLineaBridge public immutable lineaGateway;
    ILidoOptBaseMan public immutable mantleGateway;
    ILidoOptBaseMan public immutable optimismGateway;
    ILidoZkSyncBridge public immutable zksyncGateway;
    ILidoScrollBridge public immutable scrollGateway;
    IScrollMessageQueue public immutable scrollMessageQueue;
    address public immutable lidoWstEthOptimism;
    address public immutable lidoWstEthBase;
    address public immutable lidoWstEthMantle;
    IZkSync public immutable zkSyncBridge;

    uint256 public constant ARBITRUM_CHAIN_ID = 42161;
    uint256 public constant OPTIMISM_CHAIN_ID = 10;
    uint256 public constant BASE_CHAIN_ID = 8453;
    uint256 public constant LINEA_CHAIN_ID = 59144;
    uint256 public constant MANTLE_CHAIN_ID = 5000;
    uint256 public constant ZKSYNC_CHAIN_ID = 324;
    uint256 public constant SCROLL_CHAIN_ID = 534352;

    constructor(
        address __native,
        address __wnative,
        address __lidoStETH,
        address __lidoWstETH,
        address __referralId,
        address __arbitrumGateway,
        address __baseGateway,
        address __lineaGateway,
        address __mantleGateway,
        address __optimismGateway,
        address __zksyncGateway,
        address __scrollGateway,
        address __scrollMessageQueue,
        address __lidoWstEthOptimism,
        address __lidoWstEthBase,
        address __lidoWstEthMantle
    ) RouterIntentEoaAdapterWithoutDataProvider(__native, __wnative) {
        lidoStETH = __lidoStETH;
        lidoWstEth = __lidoWstETH;
        referralId = __referralId;
        arbitrumGateway = ILidoArbitrumBridge(__arbitrumGateway);
        baseGateway = ILidoOptBaseMan(__baseGateway);
        lineaGateway = ILidoLineaBridge(__lineaGateway);
        mantleGateway = ILidoOptBaseMan(__mantleGateway);
        optimismGateway = ILidoOptBaseMan(__optimismGateway);
        zksyncGateway = ILidoZkSyncBridge(__zksyncGateway);
        scrollGateway = ILidoScrollBridge(__scrollGateway);
        scrollMessageQueue = IScrollMessageQueue(__scrollMessageQueue);
        lidoWstEthOptimism = __lidoWstEthOptimism;
        lidoWstEthBase = __lidoWstEthBase;
        lidoWstEthMantle = __lidoWstEthMantle;
        zkSyncBridge = zksyncGateway.zkSync();
    }

    function name() public pure override returns (string memory) {
        return "LidoStakeEth";
    }

    /**
     * @inheritdoc EoaExecutorWithoutDataProvider
     */
    function execute(
        bytes calldata data
    ) external payable override returns (address[] memory tokens) {
        (
            address _recipient,
            uint256 _amount,
            uint256 _bridgeChainId,
            bytes memory _bridgeData
        ) = parseInputs(data);

        uint256 _bridgeFee = getBridgeFee(_bridgeChainId, _bridgeData);

        // If the adapter is called using `call` and not `delegatecall`
        if (address(this) == self()) {
            require(
                msg.value == _amount + _bridgeFee,
                Errors.INSUFFICIENT_NATIVE_FUNDS_PASSED
            );
        } else if (_amount == type(uint256).max)
            _amount = address(this).balance - _bridgeFee;
        else _amount = _amount - _bridgeFee;

        bytes memory logData;

        (tokens, logData) = _stake(
            _recipient,
            _amount,
            _bridgeChainId,
            _bridgeFee,
            _bridgeData
        );

        emit ExecutionEvent(name(), logData);

        return tokens;
    }

    //////////////////////////// ACTION LOGIC ////////////////////////////

    function _stake(
        address _recipient,
        uint256 _amount,
        uint256 _bridgeChainId,
        uint256 _bridgeFee,
        bytes memory _bridgeData
    ) internal returns (address[] memory tokens, bytes memory logData) {
        ILidoStakeEth(lidoStETH).submit{value: _amount}(referralId);

        bytes memory data;
        if (_bridgeChainId == 0) {
            tokens = new address[](2);
            tokens[0] = native();
            tokens[1] = lidoStETH;

            data = abi.encode(
                // bridge chainId
                0,
                withdrawTokens(lidoStETH, _recipient, type(uint256).max)
            );
        } else {
            tokens = new address[](3);
            tokens[0] = native();
            tokens[1] = lidoStETH;
            tokens[2] = lidoWstEth;

            data = _bridge(_bridgeChainId, _bridgeFee, _bridgeData);
        }

        logData = abi.encode(_recipient, _amount, data);
    }

    /**
     * @dev function to parse input data.
     * @param data input data.
     */
    function parseInputs(
        bytes memory data
    ) public pure returns (address, uint256, uint256, bytes memory) {
        return abi.decode(data, (address, uint256, uint256, bytes));
    }

    function _bridge(
        uint256 chainId,
        uint256 bridgeFee,
        bytes memory bridgeData
    ) internal returns (bytes memory) {
        if (chainId == ARBITRUM_CHAIN_ID) {
            return _bridgeToArbitrum(bridgeFee, bridgeData);
        } else if (chainId == OPTIMISM_CHAIN_ID) {
            return
                _bridgeToOptBaseMan(
                    OPTIMISM_CHAIN_ID,
                    optimismGateway,
                    lidoWstEthOptimism,
                    bridgeData
                );
        } else if (chainId == BASE_CHAIN_ID) {
            return
                _bridgeToOptBaseMan(
                    BASE_CHAIN_ID,
                    baseGateway,
                    lidoWstEthBase,
                    bridgeData
                );
        } else if (chainId == MANTLE_CHAIN_ID) {
            return
                _bridgeToOptBaseMan(
                    MANTLE_CHAIN_ID,
                    mantleGateway,
                    lidoWstEthMantle,
                    bridgeData
                );
        } else if (chainId == LINEA_CHAIN_ID) {
            return _bridgeToLinea(bridgeData);
        } else if (chainId == ZKSYNC_CHAIN_ID) {
            return _bridgeToZkSync(bridgeFee, bridgeData);
        } else if (chainId == SCROLL_CHAIN_ID) {
            return _bridgeToScroll(bridgeFee, bridgeData);
        } else revert(Errors.INVALID_BRIDGE_CHAIN_ID);
    }

    function _bridgeToArbitrum(
        uint256 bridgeFee,
        bytes memory data
    ) internal returns (bytes memory) {
        (
            address recipient_,
            uint256 amount_,
            uint256 maxGas_,
            uint256 gasPriceBid_,
            uint256 maxSubmissionCost_
        ) = abi.decode(data, (address, uint256, uint256, uint256, uint256));

        if (amount_ == type(uint256).max)
            amount_ = IERC20(lidoStETH).balanceOf(address(this));

        amount_ = convertToWstEth(amount_);

        IERC20(lidoWstEth).safeIncreaseAllowance(
            address(arbitrumGateway),
            amount_
        );

        // returnData = abi.encode(retryableTicketId);
        bytes memory returnData = arbitrumGateway.outboundTransfer{
            value: bridgeFee
        }(
            lidoWstEth,
            recipient_,
            amount_,
            maxGas_,
            gasPriceBid_,
            abi.encode(maxSubmissionCost_, hex"")
        );

        uint256 retryableTicketId = abi.decode(returnData, (uint256));

        return abi.encode(ARBITRUM_CHAIN_ID, amount_, retryableTicketId);
    }

    function _bridgeToOptBaseMan(
        uint256 chainId,
        ILidoOptBaseMan gateway,
        address wstEthDestChain,
        bytes memory data
    ) internal returns (bytes memory) {
        (
            address recipient_,
            uint256 amount_,
            uint32 l2Gas_,
            bytes memory data_
        ) = abi.decode(data, (address, uint256, uint32, bytes));

        if (amount_ == type(uint256).max)
            amount_ = IERC20(lidoStETH).balanceOf(address(this));

        amount_ = convertToWstEth(amount_);

        IERC20(lidoWstEth).safeIncreaseAllowance(address(gateway), amount_);

        gateway.depositERC20To(
            lidoWstEth,
            wstEthDestChain,
            recipient_,
            amount_,
            l2Gas_,
            data_
        );

        return abi.encode(chainId, amount_);
    }

    function _bridgeToLinea(bytes memory data) internal returns (bytes memory) {
        (address recipient_, uint256 amount_) = abi.decode(
            data,
            (address, uint256)
        );

        if (amount_ == type(uint256).max)
            amount_ = IERC20(lidoStETH).balanceOf(address(this));

        amount_ = convertToWstEth(amount_);

        IERC20(lidoWstEth).safeIncreaseAllowance(
            address(lineaGateway),
            amount_
        );

        lineaGateway.bridgeToken(lidoWstEth, amount_, recipient_);

        return abi.encode(LINEA_CHAIN_ID, amount_);
    }

    function _bridgeToZkSync(
        uint256 bridgeFee,
        bytes memory data
    ) internal returns (bytes memory) {
        (
            address recipient_,
            address refundRecipient_,
            uint256 amount_,
            uint256 _l2TxGasLimit
        ) = abi.decode(data, (address, address, uint256, uint256));

        if (amount_ == type(uint256).max)
            amount_ = IERC20(lidoStETH).balanceOf(address(this));
        amount_ = convertToWstEth(amount_);

        IERC20(lidoWstEth).safeIncreaseAllowance(
            address(zksyncGateway),
            amount_
        );

        bytes32 l2TxHash = zksyncGateway.deposit{value: bridgeFee}(
            recipient_,
            lidoWstEth,
            amount_,
            _l2TxGasLimit,
            800,
            refundRecipient_
        );

        return abi.encode(ZKSYNC_CHAIN_ID, amount_, l2TxHash);
    }

    function _bridgeToScroll(
        uint256 bridgeFee,
        bytes memory data
    ) internal returns (bytes memory) {
        (address recipient_, uint256 amount_) = abi.decode(
            data,
            (address, uint256)
        );

        if (amount_ == type(uint256).max)
            amount_ = IERC20(lidoStETH).balanceOf(address(this));
        amount_ = convertToWstEth(amount_);

        IERC20(lidoWstEth).safeIncreaseAllowance(
            address(scrollGateway),
            amount_
        );

        scrollGateway.depositERC20{value: bridgeFee}(
            lidoWstEth,
            recipient_,
            amount_,
            180000
        );

        return abi.encode(SCROLL_CHAIN_ID, amount_);
    }

    function convertToWstEth(uint256 amount) internal returns (uint256) {
        IERC20(lidoStETH).safeIncreaseAllowance(lidoWstEth, amount);
        uint256 wstEthBalBefore = IERC20(lidoWstEth).balanceOf(address(this));
        IWstEth(lidoWstEth).wrap(amount);
        amount = IERC20(lidoWstEth).balanceOf(address(this)) - wstEthBalBefore;

        if (amount == 0) revert(Errors.INVALID_AMOUNT);
        return amount;
    }

    function getBridgeFee(
        uint256 chainId,
        bytes memory data
    ) internal view returns (uint256) {
        if (chainId == ARBITRUM_CHAIN_ID) {
            (
                ,
                ,
                uint256 maxGas_,
                uint256 gasPriceBid_,
                uint256 maxSubmissionCost_
            ) = abi.decode(data, (address, uint256, uint256, uint256, uint256));

            return maxSubmissionCost_ + maxGas_ * gasPriceBid_;
        } else if (chainId == ZKSYNC_CHAIN_ID) {
            (, , , uint256 _l2TxGasLimit) = abi.decode(
                data,
                (address, address, uint256, uint256)
            );

            return
                zkSyncBridge.l2TransactionBaseCost(
                    tx.gasprice,
                    _l2TxGasLimit,
                    800
                );
        } else if (chainId == SCROLL_CHAIN_ID) {
            return scrollMessageQueue.estimateCrossDomainMessageFee(180000);
        } else return 0;
    }

    // solhint-disable-next-line no-empty-blocks
    receive() external payable {}
}
