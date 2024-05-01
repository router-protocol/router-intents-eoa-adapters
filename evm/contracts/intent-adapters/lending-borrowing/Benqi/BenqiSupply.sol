// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import {IBenqiPool} from "./interfaces/IBenqiPool.sol";
import {RouterIntentEoaAdapterWithoutDataProvider, EoaExecutorWithoutDataProvider} from "@routerprotocol/intents-core/contracts/RouterIntentEoaAdapter.sol";
import {Errors} from "@routerprotocol/intents-core/contracts/utils/Errors.sol";
import {IERC20, SafeERC20} from "../../../utils/SafeERC20.sol";
import {SafeMath} from "../../../utils/SafeMath.sol";

/**
 * @title BenqiSupply
 * @author Yashika Goyal
 * @notice Supplying funds on Benqi.
 */

contract BenqiSupply is RouterIntentEoaAdapterWithoutDataProvider {
    using SafeERC20 for IERC20;
    using SafeMath for uint256;

    address public immutable qiToken;

    constructor(
        address __native,
        address __wnative,
        address __qiToken
    )
        RouterIntentEoaAdapterWithoutDataProvider(__native, __wnative)
    // solhint-disable-next-line no-empty-blocks
    {
        qiToken = __qiToken;
    }

    function name() public pure override returns (string memory) {
        return "BenqiSupply";
    }

    /**
     * @inheritdoc EoaExecutorWithoutDataProvider
     */
    function execute(
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
        } else if (_amount == type(uint256).max)
            _amount = getBalance(_asset, address(this));

        bytes memory logData;

        (tokens, logData) = _benqiSupply(_asset, _recipient, _amount);

        emit ExecutionEvent(name(), logData);
        return tokens;
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
        uint256 qiTokenAmountBefore = getBalance(qiToken, address(this));

        if (asset == native()) IBenqiPool(qiToken).mint{value: amount}();
        else {
            IERC20(asset).safeIncreaseAllowance(qiToken, amount);
            IBenqiPool(qiToken).mint(amount);
        }

        uint256 qiTokenAmountReceived = getBalance(qiToken, address(this)).sub(
            qiTokenAmountBefore
        );

        withdrawTokens(qiToken, recipient, qiTokenAmountReceived);

        tokens = new address[](2);
        tokens[0] = asset;
        tokens[1] = qiToken;

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
