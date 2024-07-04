// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import {ReentrancyGuard} from "@routerprotocol/intents-core/contracts/utils/ReentrancyGuard.sol";
import {Basic} from "@routerprotocol/intents-core/contracts/common/Basic.sol";
import {CallLib} from "@routerprotocol/intents-core/contracts/utils/CallLib.sol";
import {IERC20, SafeERC20} from "@routerprotocol/intents-core/contracts/utils/SafeERC20.sol";
import {Errors} from "@routerprotocol/intents-core/contracts/utils/Errors.sol";
import {Errors as IntentErrors} from "./Errors.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {EoaExecutorWithDataProvider, EoaExecutorWithoutDataProvider} from "@routerprotocol/intents-core/contracts/RouterIntentEoaAdapter.sol";
import {BaseAdapter} from "@routerprotocol/intents-core/contracts/BaseAdapter.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";

/**
 * @title BatchTransaction
 * @author Shivam Agrawal
 * @notice Batch Transaction Contract for EOAs.
 */
contract BatchTransaction is
    Basic,
    AccessControl,
    ReentrancyGuard,
    IERC721Receiver
{
    using SafeERC20 for IERC20;

    struct RefundData {
        address[] tokens;
    }

    struct FeeInfo {
        uint96 fee;
        address recipient;
    }

    bytes32 public constant SETTER_ROLE = keccak256("SETTER_ROLE");

    address private immutable _native;
    address private immutable _wnative;
    address private _assetForwarder;
    address private _dexspan;
    address private _assetBridge;

    // user -> token array
    mapping(address => RefundData) private tokensToRefund;
    mapping(address => bool) private adapterWhitelist;

    event OperationFailedRefundEvent(
        address token,
        address recipient,
        uint256 amount
    );
    event OperationSuccessful();
    event Executed(uint256 appId);

    constructor(
        address __native,
        address __wnative,
        address __assetForwarder,
        address __dexspan,
        address __assetBridge
    ) {
        _native = __native;
        _wnative = __wnative;
        _assetForwarder = __assetForwarder;
        _dexspan = __dexspan;
        _assetBridge = __assetBridge;

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(SETTER_ROLE, msg.sender);
    }

    /**
     * @notice function to return the address of WNative token.
     */
    function wnative() public view virtual override returns (address) {
        return _wnative;
    }

    /**
     * @notice function to return the address of Native token.
     */
    function native() public view virtual override returns (address) {
        return _native;
    }

    /**
     * @notice function to return the address of Dexspan.
     */
    function dexspan() public view virtual returns (address) {
        return _dexspan;
    }

    /**
     * @notice function to return the address of AssetForwarder.
     */
    function assetForwarder() public view virtual returns (address) {
        return _assetForwarder;
    }

    /**
     * @notice function to return the address of AssetBridge.
     */
    function assetBridge() public view virtual returns (address) {
        return _assetBridge;
    }

    /**
     * @notice function to check whether an adapter is whitelisted.
     * @param adapter Address of the adapter.
     */
    function isAdapterWhitelisted(address adapter) public view returns (bool) {
        return adapterWhitelist[adapter];
    }

    /**
     * @notice function to set dexspan address.
     * @param __dexspan Address of the dexspan.
     */
    function setDexspan(address __dexspan) external onlyRole(SETTER_ROLE) {
        _dexspan = __dexspan;
    }

    /**
     * @notice function to set assetForwarder address.
     * @param __assetForwarder Address of the assetForwarder.
     */
    function setAssetForwarder(
        address __assetForwarder
    ) external onlyRole(SETTER_ROLE) {
        _assetForwarder = __assetForwarder;
    }

    /**
     * @notice function to set assetForwarder address.
     * @param __assetBridge Address of the assetBridge.
     */
    function setAssetBridge(
        address __assetBridge
    ) external onlyRole(SETTER_ROLE) {
        _assetBridge = __assetBridge;
    }

    /**
     * @notice function to set adapter whitelist.
     * @param adapters Addresses of the adapters.
     * @param shouldWhitelist Boolean array suggesting whether to whitelist the adapters.
     */
    function setAdapterWhitelist(
        address[] memory adapters,
        bool[] memory shouldWhitelist
    ) external onlyRole(SETTER_ROLE) {
        uint256 len = adapters.length;

        require(
            len != 0 && len == shouldWhitelist.length,
            Errors.ARRAY_LENGTH_MISMATCH
        );

        for (uint i = 0; i < len; ) {
            adapterWhitelist[adapters[i]] = shouldWhitelist[i];
            unchecked {
                ++i;
            }
        }
    }

    /**
     * @dev function to execute batch calls on the same chain
     * @param appId Application Id
     * @param tokens Addresses of the tokens to fetch from the user
     * @param amounts amounts of the tokens to fetch from the user
     * @param feeInfos feeInfo for the tokens
     * @param target Addresses of the contracts to call
     * @param value Amounts of native tokens to send along with the transactions
     * @param callType Type of call. 1: call, 2: delegatecall
     * @param data Data of the transactions
     */
    function executeBatchCallsSameChain(
        uint256 appId,
        address[] calldata tokens,
        uint256[] calldata amounts,
        FeeInfo[] calldata feeInfos,
        address[] calldata target,
        uint256[] calldata value,
        uint256[] calldata callType,
        bytes[] calldata data
    ) external payable nonReentrant {
        uint256 tokensLength = tokens.length;
        require(
            tokensLength == amounts.length && tokensLength == feeInfos.length,
            Errors.ARRAY_LENGTH_MISMATCH
        );
        uint256 totalValue = 0;

        for (uint256 i = 0; i < tokensLength; ) {
            totalValue += _pullTokens(tokens[i], amounts[i]);
            tokensToRefund[msg.sender].tokens.push(tokens[i]);

            if (feeInfos[i].fee != 0) {
                if (feeInfos[i].fee > (amounts[i] * 500) / 10000)
                    revert(IntentErrors.FEE_EXCEEDS_MAX_BIPS);

                if (feeInfos[i].recipient == address(0))
                    revert(IntentErrors.FEE_RECIPIENT_CANNOT_BE_ZERO_ADDRESS);

                withdrawTokens(
                    tokens[i],
                    feeInfos[i].recipient,
                    uint256(feeInfos[i].fee)
                );
            }

            unchecked {
                ++i;
            }
        }

        require(
            msg.value >= totalValue,
            Errors.INSUFFICIENT_NATIVE_FUNDS_PASSED
        );

        for (uint256 i = 0; i < callType.length; ) {
            // callType can be either 1 or 2
            require(callType[i] < 3, Errors.INVALID_CALL_TYPE);
            unchecked {
                ++i;
            }
        }

        _executeBatchCalls(appId, msg.sender, target, value, callType, data);
    }

    /**
     * @dev function to execute batch calls
     * @param appId Application Id
     * @param refundRecipient Address of recipient of refunds of dust at the end
     * @param target Addresses of the contracts to call
     * @param value Amounts of native tokens to send along with the transactions
     * @param data Data of the transactions
     * @param callType Type of call. 1: call, 2: delegatecall
     */
    function executeBatchCallsDestChain(
        uint256 appId,
        address refundRecipient,
        address[] calldata target,
        uint256[] calldata value,
        uint256[] calldata callType,
        bytes[] calldata data
    ) external payable {
        require(msg.sender == address(this), Errors.ONLY_SELF);

        _executeBatchCalls(
            appId,
            refundRecipient,
            target,
            value,
            callType,
            data
        );
    }

    /**
     * @dev function to execute batch calls
     * @param appId Application Id
     * @param target Addresses of the contracts to call
     * @param value Amounts of native tokens to send along with the transactions
     * @param data Data of the transactions
     * @param callType Type of call. 1: call, 2: delegatecall
     */
    function _executeBatchCalls(
        uint256 appId,
        address refundRecipient,
        address[] calldata target,
        uint256[] calldata value,
        uint256[] calldata callType,
        bytes[] calldata data
    ) internal {
        uint256 targetLength = target.length;

        require(
            targetLength != 0 &&
                targetLength == value.length &&
                value.length == data.length &&
                data.length == callType.length,
            Errors.WRONG_BATCH_PROVIDED
        );

        if (target.length == 1) {
            _execute(
                refundRecipient,
                target[0],
                address(0),
                address(0),
                value[0],
                callType[0],
                data[0]
            );
        } else {
            _execute(
                refundRecipient,
                target[0],
                address(0),
                target[1],
                value[0],
                callType[0],
                data[0]
            );

            for (uint256 i = 1; i < targetLength; ) {
                if (i != targetLength - 1) {
                    _execute(
                        refundRecipient,
                        target[i],
                        target[i - 1],
                        target[i + 1],
                        value[i],
                        callType[i],
                        data[i]
                    );
                } else {
                    _execute(
                        refundRecipient,
                        target[i],
                        target[i - 1],
                        address(0),
                        value[i],
                        callType[i],
                        data[i]
                    );
                }

                unchecked {
                    ++i;
                }
            }
        }

        processRefunds(refundRecipient);

        emit Executed(appId);
    }

    function _pullTokens(
        address token,
        uint256 amount
    ) internal returns (uint256) {
        uint256 totalValue = 0;
        if (token == native()) {
            totalValue += amount;
        } else {
            IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        }

        return totalValue;
    }

    function _execute(
        address refundRecipient,
        address target,
        address precedingAdapter,
        address succeedingAdapter,
        uint256 value,
        uint256 callType,
        bytes memory data
    ) internal {
        require(adapterWhitelist[target], Errors.ADAPTER_NOT_WHITELISTED);

        bytes memory _calldata;
        if (address(BaseAdapter(target).adapterDataProvider()) == address(0)) {
            _calldata = abi.encodeWithSelector(
                EoaExecutorWithoutDataProvider.execute.selector,
                data
            );
        } else {
            _calldata = abi.encodeWithSelector(
                EoaExecutorWithDataProvider.execute.selector,
                precedingAdapter,
                succeedingAdapter,
                data
            );
        }

        bytes memory result;
        if (callType == 1) result = CallLib._call(target, value, _calldata);
        else if (callType == 2)
            result = CallLib._delegateCall(target, _calldata);

        if (result.length != 0) processResult(refundRecipient, result);
    }

    function processResult(address user, bytes memory data) internal {
        address[] memory tokens = abi.decode(data, (address[]));

        for (uint256 i = 0; i < tokens.length; ) {
            tokensToRefund[user].tokens.push(tokens[i]);

            unchecked {
                ++i;
            }
        }
    }

    function processRefunds(address user) internal {
        uint256 len = tokensToRefund[user].tokens.length;

        for (uint256 i = 0; i < len; ) {
            withdrawTokens(
                tokensToRefund[user].tokens[i],
                user,
                type(uint256).max
            );

            unchecked {
                ++i;
            }
        }

        delete tokensToRefund[user];
    }

    function handleMessage(
        address tokenSent,
        uint256 amount,
        bytes memory instruction
    ) external onlyNitro nonReentrant {
        (
            uint256 appId,
            address refundAddress,
            address[] memory target,
            uint256[] memory value,
            uint256[] memory callType,
            bytes[] memory data
        ) = abi.decode(
                instruction,
                (uint256, address, address[], uint256[], uint256[], bytes[])
            );

        for (uint256 i = 0; i < callType.length; ) {
            if (callType[i] > 2) {
                withdrawTokens(tokenSent, refundAddress, amount);
                emit OperationFailedRefundEvent(
                    tokenSent,
                    refundAddress,
                    amount
                );

                return;
            }
            unchecked {
                ++i;
            }
        }

        // solhint-disable-next-line avoid-low-level-calls
        (bool success, ) = address(this).call(
            abi.encodeWithSelector(
                this.executeBatchCallsDestChain.selector,
                appId,
                refundAddress,
                target,
                value,
                callType,
                data
            )
        );

        if (success) {
            emit OperationSuccessful();
        } else {
            withdrawTokens(tokenSent, refundAddress, amount);
            emit OperationFailedRefundEvent(tokenSent, refundAddress, amount);
        }
    }

    // solhint-disable-next-line no-empty-blocks
    receive() external payable {}

    function adminWithdrawFunds(
        address _token,
        address _recipient,
        uint256 _amount
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (_token == native()) {
            if (_amount == type(uint256).max) _amount = address(this).balance;
            (bool success, ) = _recipient.call{value: _amount}("");
            if (!success) revert("Transfer failed");
        } else {
            if (_amount == type(uint256).max)
                _amount = IERC20(_token).balanceOf(address(this));
            IERC20(_token).transfer(_recipient, _amount);
        }
    }

    /**
     * @notice modifier to ensure that only Nitro bridge can call handleMessage function
     */
    modifier onlyNitro() {
        _onlyNitro();
        _;
    }

    function _onlyNitro() private view {
        require(
            msg.sender == _assetForwarder ||
                msg.sender == _dexspan ||
                msg.sender == _assetBridge,
            Errors.ONLY_NITRO
        );
    }

    function onERC721Received(
        address operator,
        address from,
        uint256 tokenId,
        bytes calldata data
    ) external returns (bytes4) {
        return this.onERC721Received.selector;
    }
}
