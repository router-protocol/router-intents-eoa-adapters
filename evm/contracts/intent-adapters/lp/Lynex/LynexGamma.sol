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
        uint256 amount0 = depositParams.depositA;
        uint256 amount1 = depositParams.depositB;

        if (address(this) == self()) {
            if (depositParams.tokenA != native())
                IERC20(depositParams.tokenA).safeTransferFrom(
                    msg.sender,
                    self(),
                    depositParams.depositA
                );
            else
                require(
                    msg.value == depositParams.depositA,
                    Errors.INSUFFICIENT_NATIVE_FUNDS_PASSED
                );

            if (depositParams.tokenB != native())
                IERC20(depositParams.tokenB).safeTransferFrom(
                    msg.sender,
                    self(),
                    depositParams.depositB
                );
            else
                require(
                    msg.value == depositParams.depositB,
                    Errors.INSUFFICIENT_NATIVE_FUNDS_PASSED
                );
        } else {
            if (depositParams.depositA == type(uint256).max)
                depositParams.depositA = getBalance(depositParams.tokenA, address(this));

            if (depositParams.depositB == type(uint256).max)
                depositParams.depositB = getBalance(depositParams.tokenB, address(this));
        }

        if (depositParams.tokenA == native()) {
            convertNativeToWnative(depositParams.depositA);
            depositParams.tokenA = wnative();
        }

        if (depositParams.tokenB == native()) {
            convertNativeToWnative(depositParams.depositB);
            depositParams.tokenB = wnative();
        }

        if(depositParams.tokenA == token0) {
            require(depositParams.tokenB == token1, "LynexGamma: Token mismatch");
        }

        if(depositParams.tokenA == token1) {
            require(depositParams.tokenB == token0, "LynexGamma: Token mismatch");
            depositParams.depositB = amount0;
            depositParams.depositA = amount1;
        }

        IERC20(token0).safeIncreaseAllowance(
            depositParams.pos,
            depositParams.depositA
        );

        IERC20(token1).safeIncreaseAllowance(
            depositParams.pos,
            depositParams.depositB
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
            _depositParams.depositA,
            _depositParams.depositB,
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
