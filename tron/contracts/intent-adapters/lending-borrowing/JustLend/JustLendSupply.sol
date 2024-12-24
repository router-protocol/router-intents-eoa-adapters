// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import {IJustLendPool} from "./interfaces/IJustLendPool.sol";
import {RouterIntentEoaAdapterWithoutDataProvider, EoaExecutorWithoutDataProvider} from "@routerprotocol/intents-core/contracts/RouterIntentEoaAdapter.sol";
import {Errors} from "../../../Errors.sol";
import {IERC20, SafeERC20} from "../../../utils/SafeERC20.sol";
import {SafeMath} from "../../../utils/SafeMath.sol";

/**
 * @title JustLendSupply
 * @author Yashika Goyal
 * @notice Supplying funds on JustLend.
 */

contract JustLendSupply is
    RouterIntentEoaAdapterWithoutDataProvider
{
    using SafeERC20 for IERC20;
    using SafeMath for uint256;

    address private immutable _cToken;

    event JustLendSupplyDest(address _token, address _recipient, uint256 _amount);

    constructor(
        address __native,
        address __wnative,
        address __cToken
    )
        RouterIntentEoaAdapterWithoutDataProvider(__native, __wnative)
    // solhint-disable-next-line no-empty-blocks
    {
        _cToken = __cToken;
    }

    function name() public pure override returns (string memory) {
        return "JustLendSupply";
    }

    function cToken() public view returns (address) {
        return _cToken;
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
        }

        bytes memory logData;

        (tokens, logData) = _justLendSupply(_asset, _recipient, _amount);

        emit ExecutionEvent(name(), logData);
        return tokens;
    }

    //////////////////////////// ACTION LOGIC ////////////////////////////

    /**
     * @notice function to supply funds to JustLend.
     * @param amount Amount of supply asset to be supplied.
     * @param recipient Recipient of aTokens after funds have been supplied.
     * @param asset Asset to be supplied.
     */
    function _justLendSupply(
        address asset,
        address recipient,
        uint256 amount
    ) private returns (address[] memory tokens, bytes memory logData) {
        uint256 cTokenAmountBefore = getBalance(_cToken, address(this));

        if (asset == native())
            IJustLendPool(_cToken).mint{value: amount}();
        else
            IJustLendPool(_cToken).mint(amount);

        uint256 cTokenAmountReceived = getBalance(_cToken, address(this))
            .sub(cTokenAmountBefore);

        withdrawTokens(_cToken, recipient, cTokenAmountReceived);

        tokens = new address[](1);
        tokens[0] = asset;
        tokens[1] = cToken();

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
