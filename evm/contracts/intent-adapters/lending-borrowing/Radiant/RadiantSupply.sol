// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import {RadiantHelpers} from "./RadiantHelpers.sol";
import {RouterIntentEoaAdapter, EoaExecutor} from "router-intents/contracts/RouterIntentEoaAdapter.sol";
import {Errors} from "../../../Errors.sol";
import {IERC20, SafeERC20} from "../../../utils/SafeERC20.sol";

/**
 * @title RadiantSupply
 * @author Yashika Goyal
 * @notice Supplying funds on Radiant.
 */
contract RadiantSupply is RouterIntentEoaAdapter, RadiantHelpers {
    using SafeERC20 for IERC20;

    constructor(
        address __native,
        address __wnative,
        address __radiantPool,
        address __radiantWrappedTokenGateway,
        uint16 __radiantReferralCode
    )
        RouterIntentEoaAdapter(__native, __wnative, false, address(0))
        RadiantHelpers(
            __radiantPool,
            __radiantWrappedTokenGateway,
            __radiantReferralCode
        )
    // solhint-disable-next-line no-empty-blocks
    {

    }

    function name() public pure override returns (string memory) {
        return "RadiantSupply";
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
        } else if (_amount == type(uint256).max)
            _amount = getBalance(_asset, address(this));

        bytes memory logData;

        (tokens, logData) = _radiantSupply(_asset, _recipient, _amount);

        emit ExecutionEvent(name(), logData);
        return tokens;
    }

    //////////////////////////// ACTION LOGIC ////////////////////////////

    /**
     * @notice function to supply funds to Radiant.
     * @param amount Amount of supply asset to be supplied.
     * @param recipient Recipient of aTokens after funds have been supplied.
     * @param asset Asset to be supplied.
     */
    function _radiantSupply(
        address asset,
        address recipient,
        uint256 amount
    ) private returns (address[] memory tokens, bytes memory logData) {
        approveToken(asset, address(radiantPool), amount);

        if (asset == native())
            radiantWrappedTokenGateway.depositETH{value: amount}(
                address(radiantPool),
                recipient,
                radiantReferralCode
            );
        else radiantPool.deposit(asset, amount, recipient, radiantReferralCode);

        tokens = new address[](1);
        tokens[0] = asset;

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
