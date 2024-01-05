// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

import {ISunswapNonfungiblePositionManager} from "./Interfaces.sol";
import {RouterIntentEoaAdapter, EoaExecutor} from "router-intents/contracts/RouterIntentEoaAdapter.sol";
import {NitroMessageHandler} from "router-intents/contracts/utils/NitroMessageHandler.sol";
import {Errors} from "router-intents/contracts/utils/Errors.sol";
import {DefaultRefundable} from "router-intents/contracts/utils/DefaultRefundable.sol";
import {IERC20, SafeERC20} from "../../../utils/SafeERC20.sol";
import {SunswapHelpers} from "./SunswapV3Helpers.sol";

/**
 * @title SunswapMint
 * @author Yashika Goyal
 * @notice Minting a new position on Sunswap V3.
 */
contract SunswapMint is
    RouterIntentEoaAdapter,
    NitroMessageHandler,
    DefaultRefundable,
    SunswapHelpers
{
    using SafeERC20 for IERC20;

    event SunswapMintPositionDest();

    constructor(
        address __native,
        address __wnative,
        address __owner,
        address __assetForwarder,
        address __dexspan,
        address __defaultRefundAddress,
        address __nonFungiblePositionManager
    )
        RouterIntentEoaAdapter(__native, __wnative, __owner)
        NitroMessageHandler(__assetForwarder, __dexspan)
        DefaultRefundable(__defaultRefundAddress)
        SunswapHelpers(__nonFungiblePositionManager)
    // solhint-disable-next-line no-empty-blocks
    {

    }

    function name() public pure override returns (string memory) {
        return "SunswapMint";
    }

    /**
     * @inheritdoc EoaExecutor
     */
    function execute(
        address,
        address,
        bytes calldata data
    ) external payable override returns (address[] memory tokens) {
        ISunswapNonfungiblePositionManager.MintParams
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
            address(positionManager()),
            mintParams.amount0Desired
        );

        IERC20(mintParams.token1).safeIncreaseAllowance(
            address(positionManager()),
            mintParams.amount1Desired
        );

        bytes memory logData;

        (tokens, logData) = _mint(mintParams);

        emit ExecutionEvent(name(), logData);
        return tokens;
    }

    /**
     * @inheritdoc NitroMessageHandler
     */
    function handleMessage(
        address tokenSent,
        uint256 amount,
        bytes memory
    ) external override onlyNitro nonReentrant {
        withdrawTokens(tokenSent, defaultRefundAddress(), amount);
        emit UnsupportedOperation(tokenSent, defaultRefundAddress(), amount);
    }

    //////////////////////////// ACTION LOGIC ////////////////////////////

    function _mint(
        ISunswapNonfungiblePositionManager.MintParams memory mintParams
    ) internal returns (address[] memory tokens, bytes memory logData) {
        (uint256 tokenId, , , ) = positionManager().mint(mintParams);

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
        returns (ISunswapNonfungiblePositionManager.MintParams memory)
    {
        return
            abi.decode(data, (ISunswapNonfungiblePositionManager.MintParams));
    }

    // solhint-disable-next-line no-empty-blocks
    receive() external payable {}
}
