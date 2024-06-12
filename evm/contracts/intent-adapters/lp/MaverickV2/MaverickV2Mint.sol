// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import {IMaverickV2RewardsRouter, IMaverickV2Position, SupplyData} from "./Interfaces.sol";
import {RouterIntentEoaAdapterWithoutDataProvider, EoaExecutorWithoutDataProvider} from "@routerprotocol/intents-core/contracts/RouterIntentEoaAdapter.sol";
import {Errors} from "@routerprotocol/intents-core/contracts/utils/Errors.sol";
import {IERC20, SafeERC20} from "../../../utils/SafeERC20.sol";

/**
 * @title MaverickV2Mint
 * @author Shivam Agrawal
 * @notice Adding liquidity on Maverick V2.
 */
contract MaverickV2Mint is RouterIntentEoaAdapterWithoutDataProvider {
    using SafeERC20 for IERC20;

    IMaverickV2RewardsRouter public immutable maverickV2RewardsRouter;
    IMaverickV2Position public immutable maverickV2Positon;

    constructor(
        address __native,
        address __wnative,
        address __maverickV2RewardsRouter
    ) RouterIntentEoaAdapterWithoutDataProvider(__native, __wnative) {
        maverickV2RewardsRouter = IMaverickV2RewardsRouter(
            __maverickV2RewardsRouter
        );

        maverickV2Positon = maverickV2RewardsRouter.position();
    }

    function name() public pure override returns (string memory) {
        return "MaverickV2Mint";
    }

    /**
     * @inheritdoc EoaExecutorWithoutDataProvider
     */
    function execute(
        bytes calldata data
    ) external payable override returns (address[] memory tokens) {
        SupplyData memory mintParams = parseInputs(data);

        // If the adapter is called using `call` and not `delegatecall`
        if (address(this) == self()) {
            if (mintParams.tokenA != native())
                IERC20(mintParams.tokenA).safeTransferFrom(
                    msg.sender,
                    self(),
                    mintParams.tokenAAmount
                );
            else
                require(
                    msg.value == mintParams.tokenAAmount,
                    Errors.INSUFFICIENT_NATIVE_FUNDS_PASSED
                );

            if (mintParams.tokenB != native())
                IERC20(mintParams.tokenB).safeTransferFrom(
                    msg.sender,
                    self(),
                    mintParams.tokenBAmount
                );
            else
                require(
                    msg.value == mintParams.tokenBAmount,
                    Errors.INSUFFICIENT_NATIVE_FUNDS_PASSED
                );
        } else {
            if (mintParams.tokenAAmount == type(uint256).max)
                mintParams.tokenAAmount = getBalance(
                    mintParams.tokenA,
                    address(this)
                );

            if (mintParams.tokenBAmount == type(uint256).max)
                mintParams.tokenBAmount = getBalance(
                    mintParams.tokenB,
                    address(this)
                );
        }

        if (mintParams.tokenA == native()) {
            convertNativeToWnative(mintParams.tokenAAmount);
            mintParams.tokenA = wnative();
        }

        if (mintParams.tokenB == native()) {
            convertNativeToWnative(mintParams.tokenBAmount);
            mintParams.tokenB = wnative();
        }

        IERC20(mintParams.tokenA).safeIncreaseAllowance(
            address(maverickV2RewardsRouter),
            mintParams.tokenAAmount
        );

        IERC20(mintParams.tokenB).safeIncreaseAllowance(
            address(maverickV2RewardsRouter),
            mintParams.tokenBAmount
        );

        (uint256 tokenAAmount, uint256 tokenBAmount, uint256 tokenId) = _mint(
            mintParams
        );

        bytes memory logData = abi.encode(
            mintParams,
            tokenId,
            tokenAAmount,
            tokenBAmount
        );

        tokens = new address[](2);
        tokens[0] = mintParams.tokenA;
        tokens[1] = mintParams.tokenB;

        emit ExecutionEvent(name(), logData);
        return tokens;
    }

    //////////////////////////// ACTION LOGIC ////////////////////////////

    function _mint(
        SupplyData memory _mintParams
    )
        internal
        returns (uint256 tokenAAmount, uint256 tokenBAmount, uint256 tokenId)
    {
        bytes[] memory results = maverickV2RewardsRouter.multicall(
            _mintParams.data
        );

        (tokenAAmount, tokenBAmount, , tokenId) = abi.decode(
            results[1],
            (uint256, uint256, uint32[], uint256)
        );

        if (_mintParams.recipient != maverickV2Positon.ownerOf(tokenId))
            revert("Add position failed");
    }

    /**
     * @dev function to parse input data.
     * @param data input data.
     */
    function parseInputs(
        bytes memory data
    ) public pure returns (SupplyData memory) {
        return abi.decode(data, (SupplyData));
    }

    // solhint-disable-next-line no-empty-blocks
    receive() external payable {}
}
