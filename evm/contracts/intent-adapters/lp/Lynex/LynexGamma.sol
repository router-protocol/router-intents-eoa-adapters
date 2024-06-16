// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import {ILynexGamma, IHypervisor} from "./Interfaces.sol";
import {RouterIntentEoaAdapterWithoutDataProvider, EoaExecutorWithoutDataProvider} from "@routerprotocol/intents-core/contracts/RouterIntentEoaAdapter.sol";
import {Errors} from "@routerprotocol/intents-core/contracts/utils/Errors.sol";
import {IERC20, SafeERC20} from "../../../utils/SafeERC20.sol";
import {LynexGammaHelpers} from "./LynexGammaHelpers.sol";

/**
 * @title LynexGamma
 * @author Yashika Goyal
 * @notice Adding liquidity on Lynex Fusion (Gamma).
 */

contract LynexGamma is
    RouterIntentEoaAdapterWithoutDataProvider,
    LynexGammaHelpers
{
    using SafeERC20 for IERC20;

    constructor(
        address __native,
        address __wnative,
        address __lynexGamma
    )
        RouterIntentEoaAdapterWithoutDataProvider(__native, __wnative)
        LynexGammaHelpers(__lynexGamma)
    // solhint-disable-next-line no-empty-blocks
    {

    }

    function name() public pure override returns (string memory) {
        return "LynexGamma";
    }

    /**
     * @inheritdoc EoaExecutorWithoutDataProvider
     */
    function execute(
        bytes calldata data
    ) external payable override returns (address[] memory tokens) {
        ILynexGamma.LynexDepositData memory depositParams = parseInputs(data);

        address token0 = address(IHypervisor(depositParams.pos).token0());
        address token1 = address(IHypervisor(depositParams.pos).token1());

        if (address(this) == self()) {
            if (token0 != native())
                IERC20(token0).safeTransferFrom(
                    msg.sender,
                    self(),
                    depositParams.deposit0
                );
            else
                require(
                    msg.value == depositParams.deposit0,
                    Errors.INSUFFICIENT_NATIVE_FUNDS_PASSED
                );

            if (token1 != native())
                IERC20(token1).safeTransferFrom(
                    msg.sender,
                    self(),
                    depositParams.deposit1
                );
            else
                require(
                    msg.value == depositParams.deposit1,
                    Errors.INSUFFICIENT_NATIVE_FUNDS_PASSED
                );
        } else {
            if (depositParams.deposit0 == type(uint256).max)
                depositParams.deposit0 = getBalance(token0, address(this));

            if (depositParams.deposit1 == type(uint256).max)
                depositParams.deposit1 = getBalance(token1, address(this));
        }

        if (token0 == native()) {
            convertNativeToWnative(depositParams.deposit0);
            token0 = wnative();
        }

        if (token1 == native()) {
            convertNativeToWnative(depositParams.deposit1);
            token1 = wnative();
        }

        IERC20(token0).safeIncreaseAllowance(
            depositParams.pos,
            depositParams.deposit0
        );

        IERC20(token1).safeIncreaseAllowance(
            depositParams.pos,
            depositParams.deposit1
        );

        uint256 shares = _mint(depositParams);

        bytes memory logData = abi.encode(depositParams, shares);

        tokens = new address[](3);
        tokens[0] = token0;
        tokens[1] = token1;
        tokens[2] = depositParams.pos;

        emit ExecutionEvent(name(), logData);
        return tokens;
    }

    //////////////////////////// ACTION LOGIC ////////////////////////////

    function _mint(
        ILynexGamma.LynexDepositData memory _depositParams
    ) internal returns (uint256 shares) {

        uint256 userBalBefore = IHypervisor(_depositParams.pos).balanceOf(
            _depositParams.to
        );

        (shares) = lynexGamma.deposit(
            _depositParams.deposit0,
            _depositParams.deposit1,
            _depositParams.to,
            _depositParams.pos,
            _depositParams.minIn
        );

        uint256 balanceReceived = (IHypervisor(_depositParams.pos).balanceOf(
            _depositParams.to
        )) - userBalBefore;

        if (balanceReceived == 0) revert("Liquidity Token not received");
    }

    /**
     * @dev function to parse input data.
     * @param data input data.
     */
    function parseInputs(
        bytes memory data
    ) public pure returns (ILynexGamma.LynexDepositData memory) {
        return abi.decode(data, (ILynexGamma.LynexDepositData));
    }

    // solhint-disable-next-line no-empty-blocks
    receive() external payable {}
}
