// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import {ILidoStakeEth, ILidoOptBaseMan, IWstEth, IScrollMessageQueue, ILidoScrollBridge} from "./Interfaces.sol";
import {RouterIntentEoaAdapterWithoutDataProvider, EoaExecutorWithoutDataProvider} from "@routerprotocol/intents-core/contracts/RouterIntentEoaAdapter.sol";
import {Errors} from "../../../Errors.sol";
import {IERC20, SafeERC20} from "../../../utils/SafeERC20.sol";

/**
 * @title LidoStakeEthTestnet
 * @author Yashika Goyal
 * @notice Staking ETH to receive StEth on Lido.
 * @notice This contract is only for Ethereum chain.
 */
contract LidoStakeEthTestnet is RouterIntentEoaAdapterWithoutDataProvider {
    using SafeERC20 for IERC20;

    address public immutable lidoStETH;
    address public immutable lidoWstEth;
    address public immutable referralId;
    ILidoOptBaseMan public immutable optimismGateway;
    ILidoScrollBridge public immutable scrollGateway;
    IScrollMessageQueue public immutable scrollMessageQueue;
    address public immutable lidoWstEthOptimism;

    uint256 public constant OPTIMISM_SEPOLIA_CHAIN_ID = 11155420;
    uint256 public constant SCROLL_SEPOLIA_CHAIN_ID = 534351;

    constructor(
        address __native,
        address __wnative,
        address __lidoStETH,
        address __lidoWstETH,
        address __referralId,
        address __optimismGateway,
        address __scrollGateway,
        address __scrollMessageQueue,
        address __lidoWstEthOptimism
    ) RouterIntentEoaAdapterWithoutDataProvider(__native, __wnative) {
        lidoStETH = __lidoStETH;
        lidoWstEth = __lidoWstETH;
        referralId = __referralId;
        optimismGateway = ILidoOptBaseMan(__optimismGateway);
        scrollGateway = ILidoScrollBridge(__scrollGateway);
        scrollMessageQueue = IScrollMessageQueue(__scrollMessageQueue);
        lidoWstEthOptimism = __lidoWstEthOptimism;
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
        if (chainId == OPTIMISM_SEPOLIA_CHAIN_ID) {
            return
                _bridgeToOptBaseMan(
                    OPTIMISM_SEPOLIA_CHAIN_ID,
                    optimismGateway,
                    lidoWstEthOptimism,
                    bridgeData
                );
        } else if (chainId == SCROLL_SEPOLIA_CHAIN_ID) {
            return _bridgeToScroll(bridgeFee, bridgeData);
        } else revert(Errors.INVALID_BRIDGE_CHAIN_ID);
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

        return abi.encode(SCROLL_SEPOLIA_CHAIN_ID, amount_);
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
        if (chainId == SCROLL_SEPOLIA_CHAIN_ID) {
            return scrollMessageQueue.estimateCrossDomainMessageFee(180000);
        } else return 0;
    }

    // solhint-disable-next-line no-empty-blocks
    receive() external payable {}
}
