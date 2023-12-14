// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

import {IUniswapV3NonfungiblePositionManager} from "./Interfaces.sol";
import {RouterIntentAdapter, NitroMessageHandler, Errors} from "router-intents/contracts/RouterIntentAdapter.sol";
import {IERC20, SafeERC20} from "../../../utils/SafeERC20.sol";
import {UniswapV3Helpers} from "./UniswapV3Helpers.sol";

/**
 * @title UniswapV3Mint
 * @author Shivam Agrawal
 * @notice Minting a new position on Uniswap V3.
 */
contract UniswapV3Mint is RouterIntentAdapter, UniswapV3Helpers {
    using SafeERC20 for IERC20;

    address private immutable _self;

    event UniswapV3MintPositionDest();

    constructor(
        address __native,
        address __wnative,
        address __assetForwarder,
        address __dexspan,
        address __defaultRefundAddress,
        address __nonFungiblePositionManager
    )
        RouterIntentAdapter(
            __native,
            __wnative,
            __assetForwarder,
            __dexspan,
            __defaultRefundAddress
        )
        UniswapV3Helpers(__nonFungiblePositionManager)
    {
        _self = address(this);
    }

    function name() public pure override returns (string memory) {
        return "UniswapV3Mint";
    }

    /**
     * @inheritdoc RouterIntentAdapter
     */
    function execute(
        address,
        address,
        bytes calldata data
    ) external payable override returns (address[] memory tokens) {
        IUniswapV3NonfungiblePositionManager.MintParams
            memory mintParams = parseInputs(data);

        if (mintParams.token0 == native()) {
            convertNativeToWnative(mintParams.amount0Desired);
            mintParams.token0 = wnative();
        }

        if (mintParams.token1 == native()) {
            convertNativeToWnative(mintParams.amount0Desired);
            mintParams.token1 = wnative();
        }

        // If the adapter is called using `call` and not `delegatecall`
        if (address(this) == _self) {
            IERC20(mintParams.token0).safeTransferFrom(
                msg.sender,
                address(this),
                mintParams.amount0Desired
            );

            IERC20(mintParams.token1).safeTransferFrom(
                msg.sender,
                address(this),
                mintParams.amount1Desired
            );
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
        IUniswapV3NonfungiblePositionManager.MintParams memory mintParams
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
        returns (IUniswapV3NonfungiblePositionManager.MintParams memory)
    {
        return
            abi.decode(data, (IUniswapV3NonfungiblePositionManager.MintParams));
    }

    // solhint-disable-next-line no-empty-blocks
    receive() external payable {}
}
