// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import {IUniswapV3NonfungiblePositionManager} from "./Interfaces.sol";
import {RouterIntentEoaAdapter, EoaExecutor} from "router-intents/contracts/RouterIntentEoaAdapter.sol";
import {Errors} from "../../../Errors.sol";
import {IERC20, SafeERC20} from "../../../utils/SafeERC20.sol";
import {UniswapV3Helpers} from "./UniswapV3Helpers.sol";

/**
 * @title UniswapV3Mint
 * @author Shivam Agrawal
 * @notice Minting a new position on Uniswap V3.
 */
contract UniswapV3Mint is RouterIntentEoaAdapter, UniswapV3Helpers {
    using SafeERC20 for IERC20;

    constructor(
        address __native,
        address __wnative,
        address __nonFungiblePositionManager
    )
        RouterIntentEoaAdapter(__native, __wnative, false, address(0))
        UniswapV3Helpers(__nonFungiblePositionManager)
    // solhint-disable-next-line no-empty-blocks
    {

    }

    function name() public pure override returns (string memory) {
        return "UniswapV3Mint";
    }

    /**
     * @inheritdoc EoaExecutor
     */
    function execute(
        address,
        address,
        bytes calldata data
    ) external payable override returns (address[] memory tokens) {
        IUniswapV3NonfungiblePositionManager.MintParams
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
            convertNativeToWnative(mintParams.amount0Desired);
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
        IUniswapV3NonfungiblePositionManager.MintParams memory mintParams
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
        returns (IUniswapV3NonfungiblePositionManager.MintParams memory)
    {
        return
            abi.decode(data, (IUniswapV3NonfungiblePositionManager.MintParams));
    }

    // solhint-disable-next-line no-empty-blocks
    receive() external payable {}
}
