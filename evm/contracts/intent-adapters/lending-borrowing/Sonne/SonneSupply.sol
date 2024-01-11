// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

import {ISonnePool} from "./interfaces/ISonnePool.sol";
import {RouterIntentEoaAdapter, EoaExecutor} from "router-intents/contracts/RouterIntentEoaAdapter.sol";
import {NitroMessageHandler} from "router-intents/contracts/utils/NitroMessageHandler.sol";
import {Errors} from "router-intents/contracts/utils/Errors.sol";
import {IERC20, SafeERC20} from "../../../utils/SafeERC20.sol";
import {SafeMath} from "../../../utils/SafeMath.sol";

/**
 * @title SonneSupply
 * @author Yashika Goyal
 * @notice Supplying funds on Sonne.
 */

contract SonneSupply is
    RouterIntentEoaAdapter,
    NitroMessageHandler
{
    using SafeERC20 for IERC20;
    using SafeMath for uint256;

    address private immutable _soToken;

    event SonneSupplyDest(address _token, address _recipient, uint256 _amount);

    constructor(
        address __native,
        address __wnative,
        address __owner,
        address __assetForwarder,
        address __dexspan,
        address __soToken
    )
        RouterIntentEoaAdapter(__native, __wnative, __owner)
        NitroMessageHandler(__assetForwarder, __dexspan)
    // solhint-disable-next-line no-empty-blocks
    {
        _soToken = __soToken;
    }

    function name() public pure override returns (string memory) {
        return "SonneSupply";
    }

    function soToken() public view returns (address) {
        return _soToken;
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
            IERC20(_asset).safeTransferFrom(msg.sender, self(), _amount);
        }

        bytes memory logData;

        (tokens, logData) = _sonneSupply(_asset, _recipient, _amount);

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

        uint256 soTokenAmountBefore = getBalance(_soToken, address(this));

        if (tokenSent == native()) {
                withdrawTokens(native(), recipient, amount);
                emit OperationFailedRefundEvent(native(), recipient, amount);
            }
        else {
            IERC20(tokenSent).safeIncreaseAllowance(_soToken, amount);
            try ISonnePool(_soToken).mint(amount){
                uint256 soTokenAmountReceived = getBalance(_soToken, address(this))
                .sub(soTokenAmountBefore);

                withdrawTokens(_soToken, recipient, soTokenAmountReceived);
                emit SonneSupplyDest(native(), recipient, amount);
            } catch {
                withdrawTokens(native(), recipient, amount);
                emit OperationFailedRefundEvent(native(), recipient, amount);
            }
        }
    }

    //////////////////////////// ACTION LOGIC ////////////////////////////

    /**
     * @notice function to supply funds to Sonne.
     * @param amount Amount of supply asset to be supplied.
     * @param recipient Recipient of aTokens after funds have been supplied.
     * @param asset Asset to be supplied.
     */
    function _sonneSupply(
        address asset,
        address recipient,
        uint256 amount
    ) private returns (address[] memory tokens, bytes memory logData) {
        uint256 soTokenAmountBefore = getBalance(_soToken, address(this));
        IERC20(asset).safeIncreaseAllowance(_soToken, amount);
        ISonnePool(_soToken).mint(amount);

        uint256 soTokenAmountReceived = getBalance(_soToken, address(this))
            .sub(soTokenAmountBefore);

        withdrawTokens(_soToken, recipient, soTokenAmountReceived);

        tokens = new address[](2);
        tokens[0] = asset;
        tokens[1] = soToken();

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
