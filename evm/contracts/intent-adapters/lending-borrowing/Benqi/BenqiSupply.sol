// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

import {IBenqiPool} from "./interfaces/IBenqiPool.sol";
import {RouterIntentEoaAdapter, EoaExecutor} from "router-intents/contracts/RouterIntentEoaAdapter.sol";
import {NitroMessageHandler} from "router-intents/contracts/utils/NitroMessageHandler.sol";
import {Errors} from "router-intents/contracts/utils/Errors.sol";
import {IERC20, SafeERC20} from "../../../utils/SafeERC20.sol";
import {SafeMath} from "../../../utils/SafeMath.sol";

/**
 * @title BenqiSupply
 * @author Yashika Goyal
 * @notice Supplying funds on Benqi.
 */

contract BenqiSupply is
    RouterIntentEoaAdapter,
    NitroMessageHandler
{
    using SafeERC20 for IERC20;
    using SafeMath for uint256;

    address private immutable _qiToken;

    event BenqiSupplyDest(address _token, address _recipient, uint256 _amount);

    constructor(
        address __native,
        address __wnative,
        address __owner,
        address __assetForwarder,
        address __dexspan,
        address __qiToken
    )
        RouterIntentEoaAdapter(__native, __wnative, __owner)
        NitroMessageHandler(__assetForwarder, __dexspan)
    // solhint-disable-next-line no-empty-blocks
    {
        _qiToken = __qiToken;
    }

    function name() public pure override returns (string memory) {
        return "BenqiSupply";
    }

    function qiToken() public view returns (address) {
        return _qiToken;
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

        (tokens, logData) = _benqiSupply(_asset, _recipient, _amount);

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

        uint256 qiTokenAmountBefore = getBalance(_qiToken, address(this));

        if (tokenSent == native())
            try IBenqiPool(_qiToken).mint{value: amount}() {
                uint256 qiTokenAmountReceived = getBalance(_qiToken, address(this)).sub(qiTokenAmountBefore);

                withdrawTokens(_qiToken, recipient, qiTokenAmountReceived);
                emit BenqiSupplyDest(native(), recipient, amount);
            } catch {
                withdrawTokens(native(), recipient, amount);
                emit OperationFailedRefundEvent(native(), recipient, amount);
            }
        else {
            IERC20(tokenSent).safeIncreaseAllowance(_qiToken, amount);
            try IBenqiPool(_qiToken).mint(amount){
                uint256 qiTokenAmountReceived = getBalance(_qiToken, address(this))
                .sub(qiTokenAmountBefore);

                withdrawTokens(_qiToken, recipient, qiTokenAmountReceived);
                emit BenqiSupplyDest(native(), recipient, amount);
        } catch {
                withdrawTokens(native(), recipient, amount);
                emit OperationFailedRefundEvent(native(), recipient, amount);
            }
        }
    }

    //////////////////////////// ACTION LOGIC ////////////////////////////

    /**
     * @notice function to supply funds to Benqi.
     * @param amount Amount of supply asset to be supplied.
     * @param recipient Recipient of aTokens after funds have been supplied.
     * @param asset Asset to be supplied.
     */
    function _benqiSupply(
        address asset,
        address recipient,
        uint256 amount
    ) private returns (address[] memory tokens, bytes memory logData) {
        uint256 qiTokenAmountBefore = getBalance(_qiToken, address(this));

        if (asset == native())
            IBenqiPool(_qiToken).mint{value: amount}();
        else {
            IERC20(asset).safeIncreaseAllowance(_qiToken, amount);
            IBenqiPool(_qiToken).mint(amount);
        }

        uint256 qiTokenAmountReceived = getBalance(_qiToken, address(this))
            .sub(qiTokenAmountBefore);

        withdrawTokens(_qiToken, recipient, qiTokenAmountReceived);

        tokens = new address[](2);
        tokens[0] = asset;
        tokens[1] = qiToken();

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
