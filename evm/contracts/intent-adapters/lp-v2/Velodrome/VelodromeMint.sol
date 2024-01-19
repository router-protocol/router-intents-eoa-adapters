// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import {IVelodromeFactory, IVelodromeRouter} from "./Interfaces.sol";
import {RouterIntentEoaAdapter, EoaExecutor} from "router-intents/contracts/RouterIntentEoaAdapter.sol";
import {Errors} from "../../../Errors.sol";
import {IERC20, SafeERC20} from "../../../utils/SafeERC20.sol";
import {VelodromeHelpers} from "./VelodromeHelpers.sol";

/**
 * @title VelodromeMint
 * @author Yashika Goyal
 * @notice Adding liquidity on Velodrome.
 */

contract VelodromeMint is RouterIntentEoaAdapter, VelodromeHelpers {
    using SafeERC20 for IERC20;

    constructor(
        address __native,
        address __wnative,
        address __veloRouter,
        address __veloFactory
    )
        RouterIntentEoaAdapter(__native, __wnative, false, address(0))
        VelodromeHelpers(__veloRouter, __veloFactory)
    // solhint-disable-next-line no-empty-blocks
    {

    }

    function name() public pure override returns (string memory) {
        return "VelodromeMint";
    }

    /**
     * @inheritdoc EoaExecutor
     */
    function execute(
        address,
        address,
        bytes calldata data
    ) external payable override returns (address[] memory tokens) {
        IVelodromeRouter.VeloSupplyData
            memory mintParams = parseInputs(data);

        // If the adapter is called using `call` and not `delegatecall`
        if (address(this) == self()) {
            if (mintParams.tokenA != native())
                IERC20(mintParams.tokenA).safeTransferFrom(
                    msg.sender,
                    self(),
                    mintParams.amountADesired
                );
            else
                require(
                    msg.value == mintParams.amountADesired,
                    Errors.INSUFFICIENT_NATIVE_FUNDS_PASSED
                );

            if (mintParams.tokenB != native())
                IERC20(mintParams.tokenB).safeTransferFrom(
                    msg.sender,
                    self(),
                    mintParams.amountBDesired
                );
            else
                require(
                    msg.value == mintParams.amountBDesired,
                    Errors.INSUFFICIENT_NATIVE_FUNDS_PASSED
                );
        } else {
            if (mintParams.amountADesired == type(uint256).max)
                mintParams.amountADesired = getBalance(
                    mintParams.tokenA,
                    address(this)
                );

            if (mintParams.amountBDesired == type(uint256).max)
                mintParams.amountBDesired = getBalance(
                    mintParams.tokenB,
                    address(this)
                );
        }

        if (mintParams.tokenA == native()) {
            convertNativeToWnative(mintParams.amountADesired);
            mintParams.tokenA = wnative();
        }

        if (mintParams.tokenB == native()) {
            convertNativeToWnative(mintParams.amountADesired);
            mintParams.tokenB = wnative();
        }

        IERC20(mintParams.tokenA).safeIncreaseAllowance(
            address(veloRouter),
            mintParams.amountADesired
        );

        IERC20(mintParams.tokenB).safeIncreaseAllowance(
            address(veloRouter),
            mintParams.amountBDesired
        );

        (uint256 amountA, uint256 amountB, uint256 liqAmount) = _mint(mintParams);

        bytes memory logData = abi.encode(
            mintParams,
            amountA,
            amountB,
            liqAmount
        );

        tokens = new address[](2);
        tokens[0] = mintParams.tokenA;
        tokens[1] = mintParams.tokenB;

        emit ExecutionEvent(name(), logData);
        return tokens;
    }

    //////////////////////////// ACTION LOGIC ////////////////////////////

    function _mint(
        IVelodromeRouter.VeloSupplyData memory _mintParams
    ) internal returns (uint256 amountA, uint256 amountB, uint256 liqAmount) {
        if (_mintParams.tokenA == native()) {
            (amountB, amountA, liqAmount) = veloRouter.addLiquidityETH{
                value: _mintParams.amountADesired
            }(
                _mintParams.tokenB,
                _mintParams.stable,
                _mintParams.amountBDesired,
                _mintParams.amountBMin,
                _mintParams.amountAMin,
                _mintParams.to,
                _mintParams.deadline
            );
        } else if (_mintParams.tokenB == native()) {
            (amountA, amountB, liqAmount) = veloRouter.addLiquidityETH{
                value: _mintParams.amountBDesired
            }(
                _mintParams.tokenA,
                _mintParams.stable,
                _mintParams.amountADesired,
                _mintParams.amountAMin,
                _mintParams.amountBMin,
                _mintParams.to,
                _mintParams.deadline
            );
        } else {
            (amountA, amountB, liqAmount) = veloRouter.addLiquidity(
                _mintParams.tokenA,
                _mintParams.tokenB,
                _mintParams.stable,
                _mintParams.amountADesired,
                _mintParams.amountBDesired,
                _mintParams.amountAMin,
                _mintParams.amountBMin,
                _mintParams.to,
                _mintParams.deadline
            );
        }
    }

    /**
     * @dev function to parse input data.
     * @param data input data.
     */
    function parseInputs(
        bytes memory data
    )
        public
        pure
        returns (IVelodromeRouter.VeloSupplyData memory)
    {
        return
            abi.decode(data, (IVelodromeRouter.VeloSupplyData));
    }

    // solhint-disable-next-line no-empty-blocks
    receive() external payable {}
}
