// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import {IQuickswapNonfungiblePositionManager} from "./Interfaces.sol";
import {RouterIntentEoaAdapterWithoutDataProvider, EoaExecutorWithoutDataProvider} from "@routerprotocol/intents-core/contracts/RouterIntentEoaAdapter.sol";
import {Errors} from "@routerprotocol/intents-core/contracts/utils/Errors.sol";
import {IERC20, SafeERC20} from "../../../utils/SafeERC20.sol";
import {QuickswapHelpers} from "./QuickswapHelpers.sol";

/**
 * @title QuickswapMint
 * @author Yashika Goyal
 * @notice Minting a new position on Quickswap.
 */
contract QuickswapMint is RouterIntentEoaAdapterWithoutDataProvider, QuickswapHelpers {
    using SafeERC20 for IERC20;

    constructor(
        address __native,
        address __wnative,
        address __nonFungiblePositionManager
    )
        RouterIntentEoaAdapterWithoutDataProvider(__native, __wnative)
        QuickswapHelpers(__nonFungiblePositionManager)
    // solhint-disable-next-line no-empty-blocks
    {

    }

    function name() public pure override returns (string memory) {
        return "QuickswapMint";
    }

    /**
     * @inheritdoc EoaExecutorWithoutDataProvider
     */
    function execute(
        bytes calldata data
    ) external payable override returns (address[] memory tokens) {
        IQuickswapNonfungiblePositionManager.MintParams
            memory mintParams = parseInputs(data);

        // If the adapter is called using `call` and not `delegatecall`
        if (address(this) == self()) {
            if (mintParams.token0 != native())
                IERC20(mintParams.token0).safeTransferFrom(
                    msg.sender,
                    self(),
                    mintParams.amount0Desired
                );
            else
                require(
                    msg.value == mintParams.amount0Desired,
                    Errors.INSUFFICIENT_NATIVE_FUNDS_PASSED
                );

            if (mintParams.token1 != native())
                IERC20(mintParams.token1).safeTransferFrom(
                    msg.sender,
                    self(),
                    mintParams.amount1Desired
                );
            else
                require(
                    msg.value == mintParams.amount1Desired,
                    Errors.INSUFFICIENT_NATIVE_FUNDS_PASSED
                );
        } else {
            if (mintParams.amount0Desired == type(uint256).max)
                mintParams.amount0Desired = getBalance(
                    mintParams.token0,
                    address(this)
                );

            if (mintParams.amount1Desired == type(uint256).max)
                mintParams.amount1Desired = getBalance(
                    mintParams.token1,
                    address(this)
                );
        }

        if (mintParams.token0 == native()) {
            convertNativeToWnative(mintParams.amount0Desired);
            mintParams.token0 = wnative();
        }

        if (mintParams.token1 == native()) {
            convertNativeToWnative(mintParams.amount1Desired);
            mintParams.token1 = wnative();
        }

        IERC20(mintParams.token0).safeIncreaseAllowance(
            address(nonFungiblePositionManager),
            mintParams.amount0Desired
        );

        IERC20(mintParams.token1).safeIncreaseAllowance(
            address(nonFungiblePositionManager),
            mintParams.amount1Desired
        );

        bytes memory logData;

        (tokens, logData) = _mint(mintParams);

        emit ExecutionEvent(name(), logData);
        return tokens;
    }

    //////////////////////////// ACTION LOGIC ////////////////////////////

    function _mint(
        IQuickswapNonfungiblePositionManager.MintParams memory mintParams
    ) internal returns (address[] memory tokens, bytes memory logData) {
        (uint256 tokenId, , , ) = nonFungiblePositionManager.mint(mintParams);

        tokens = new address[](2);
        tokens[0] = mintParams.token0;
        tokens[1] = mintParams.token1;

        logData = abi.encode(mintParams, tokenId);
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
        returns (IQuickswapNonfungiblePositionManager.MintParams memory)
    {
        return
            abi.decode(data, (IQuickswapNonfungiblePositionManager.MintParams));
    }

    // solhint-disable-next-line no-empty-blocks
    receive() external payable {}
}
