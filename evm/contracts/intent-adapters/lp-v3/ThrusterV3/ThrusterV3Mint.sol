// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import {INonfungiblePositionManager} from "./Interfaces.sol";
import {RouterIntentEoaAdapterWithoutDataProvider, EoaExecutorWithoutDataProvider} from "@routerprotocol/intents-core/contracts/RouterIntentEoaAdapter.sol";
import {Errors} from "@routerprotocol/intents-core/contracts/utils/Errors.sol";
import {IERC20, SafeERC20} from "../../../utils/SafeERC20.sol";

/**
 * @title ThrusterV3Mint
 * @author Shivam Agrawal
 * @notice Minting a new position on Thruster V3.
 */
contract ThrusterV3Mint is RouterIntentEoaAdapterWithoutDataProvider {
    using SafeERC20 for IERC20;

    INonfungiblePositionManager public immutable positionManager;

    constructor(
        address __native,
        address __wnative,
        address __positionManager
    ) RouterIntentEoaAdapterWithoutDataProvider(__native, __wnative) {
        positionManager = INonfungiblePositionManager(__positionManager);
    }

    function name() public pure override returns (string memory) {
        return "ThrusterV3Mint";
    }

    /**
     * @inheritdoc EoaExecutorWithoutDataProvider
     */
    function execute(
        bytes calldata data
    ) external payable override returns (address[] memory tokens) {
        INonfungiblePositionManager.MintParams memory mintParams = parseInputs(
            data
        );

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
            address(positionManager),
            mintParams.amount0Desired
        );

        IERC20(mintParams.token1).safeIncreaseAllowance(
            address(positionManager),
            mintParams.amount1Desired
        );

        bytes memory logData;

        (tokens, logData) = _mint(mintParams);

        emit ExecutionEvent(name(), logData);
        return tokens;
    }

    //////////////////////////// ACTION LOGIC ////////////////////////////

    function _mint(
        INonfungiblePositionManager.MintParams memory mintParams
    ) internal returns (address[] memory tokens, bytes memory logData) {
        (uint256 tokenId, , , ) = positionManager.mint(mintParams);

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
    ) public pure returns (INonfungiblePositionManager.MintParams memory) {
        return abi.decode(data, (INonfungiblePositionManager.MintParams));
    }

    // solhint-disable-next-line no-empty-blocks
    receive() external payable {}
}
