// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import {IMPendleConvertor} from "./Interfaces.sol";
import {RouterIntentEoaAdapterWithoutDataProvider, EoaExecutorWithoutDataProvider} from "@routerprotocol/intents-core/contracts/RouterIntentEoaAdapter.sol";
import {Errors} from "@routerprotocol/intents-core/contracts/utils/Errors.sol";
import {IERC20, SafeERC20} from "../../../utils/SafeERC20.sol";

/**
 * @title PenpieStakePendle
 * @author Yashika Goyal
 * @notice Staking PENDLE on Penpie.
 */
contract PenpieStakePendle is RouterIntentEoaAdapterWithoutDataProvider {
    using SafeERC20 for IERC20;

    address public immutable pendle;
    address public immutable mPendleReceiptToken;
    IMPendleConvertor public immutable mPendleConvertor;

    constructor(
        address __native,
        address __wnative,
        address __pendle,
        address __mPendleReceiptToken,
        address __mPendleConvertor
    ) RouterIntentEoaAdapterWithoutDataProvider(__native, __wnative) {
        pendle = __pendle;
        mPendleReceiptToken = __mPendleReceiptToken;
        mPendleConvertor = IMPendleConvertor(__mPendleConvertor);
    }

    function name() public pure override returns (string memory) {
        return "PenpieStakePendle";
    }

    /**
     * @inheritdoc EoaExecutorWithoutDataProvider
     */
    function execute(
        bytes calldata data
    ) external payable override returns (address[] memory tokens) {
        (address _recipient, uint256 _amount) = parseInputs(data);

        // If the adapter is called using `call` and not `delegatecall`
        if (address(this) == self()) {
            IERC20(pendle).safeTransferFrom(msg.sender, self(), _amount);
        } else if (_amount == type(uint256).max)
            _amount = IERC20(pendle).balanceOf(address(this));

        bytes memory logData;

        (tokens, logData) = _stake(_recipient, _amount);

        emit ExecutionEvent(name(), logData);
        return tokens;
    }

    //////////////////////////// ACTION LOGIC ////////////////////////////

    function _stake(
        address _recipient,
        uint256 _amount
    ) internal returns (address[] memory tokens, bytes memory logData) {
        IERC20(pendle).safeIncreaseAllowance(address(mPendleConvertor), _amount);
        mPendleConvertor.convert(_recipient, _amount, 1);

        tokens = new address[](2);
        tokens[0] = pendle;
        tokens[1] = mPendleReceiptToken;

        logData = abi.encode(_recipient, _amount);
    }

    /**
     * @dev function to parse input data.
     * @param data input data.
     */
    function parseInputs(
        bytes memory data
    ) public pure returns (address, uint256) {
        return abi.decode(data, (address, uint256));
    }

    // solhint-disable-next-line no-empty-blocks
    receive() external payable {}
}
