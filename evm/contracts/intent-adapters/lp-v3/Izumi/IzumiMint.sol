// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import {ILiquidityManager} from "./Interfaces.sol";
import {RouterIntentEoaAdapterWithoutDataProvider, EoaExecutorWithoutDataProvider} from "@routerprotocol/intents-core/contracts/RouterIntentEoaAdapter.sol";
import {Errors} from "@routerprotocol/intents-core/contracts/utils/Errors.sol";
import {IERC20, SafeERC20} from "../../../utils/SafeERC20.sol";
import {IzumiHelpers} from "./IzumiHelpers.sol";

/**
 * @title IzumiMint
 * @author Yashika Goyal
 * @notice Minting a new position on Izumi.
 */
contract IzumiMint is RouterIntentEoaAdapterWithoutDataProvider, IzumiHelpers {
    using SafeERC20 for IERC20;

    constructor(
        address __native,
        address __wnative,
        address __liquidityManager
    )
        RouterIntentEoaAdapterWithoutDataProvider(__native, __wnative)
        IzumiHelpers(__liquidityManager)
    // solhint-disable-next-line no-empty-blocks
    {

    }

    function name() public pure override returns (string memory) {
        return "IzumiMint";
    }

    /**
     * @inheritdoc EoaExecutorWithoutDataProvider
     */
    function execute(
        bytes calldata data
    ) external payable override returns (address[] memory tokens) {
        ILiquidityManager.MintParams
            memory mintParams = parseInputs(data);

        // If the adapter is called using `call` and not `delegatecall`
        if (address(this) == self()) {
            if (mintParams.tokenX != native())
                IERC20(mintParams.tokenX).safeTransferFrom(
                    msg.sender,
                    self(),
                    mintParams.xLim
                );
            else
                require(
                    msg.value == mintParams.xLim,
                    Errors.INSUFFICIENT_NATIVE_FUNDS_PASSED
                );

            if (mintParams.tokenY != native())
                IERC20(mintParams.tokenY).safeTransferFrom(
                    msg.sender,
                    self(),
                    mintParams.yLim
                );
            else
                require(
                    msg.value == mintParams.yLim,
                    Errors.INSUFFICIENT_NATIVE_FUNDS_PASSED
                );
        } else {
            if (mintParams.xLim == type(uint128).max)
                mintParams.xLim = uint128(getBalance(
                    mintParams.tokenX,
                    address(this)
                ));

            if (mintParams.yLim == type(uint128).max)
                mintParams.yLim = uint128(getBalance(
                    mintParams.tokenY,
                    address(this)
                ));
        }

        if (mintParams.tokenX == native()) {
            convertNativeToWnative(mintParams.xLim);
            mintParams.tokenX = wnative();
        }

        if (mintParams.tokenY == native()) {
            convertNativeToWnative(mintParams.yLim);
            mintParams.tokenY = wnative();
        }

        IERC20(mintParams.tokenX).safeIncreaseAllowance(
            address(liquidityManager),
            mintParams.xLim
        );

        IERC20(mintParams.tokenY).safeIncreaseAllowance(
            address(liquidityManager),
            mintParams.yLim
        );

        bytes memory logData;

        (tokens, logData) = _mint(mintParams);

        emit ExecutionEvent(name(), logData);
        return tokens;
    }

    //////////////////////////// ACTION LOGIC ////////////////////////////

    function _mint(
        ILiquidityManager.MintParams memory mintParams
    ) internal returns (address[] memory tokens, bytes memory logData) {
        (uint256 tokenId, , , ) = liquidityManager.mint(mintParams);

        tokens = new address[](2);
        tokens[0] = mintParams.tokenX;
        tokens[1] = mintParams.tokenY;

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
        returns (ILiquidityManager.MintParams memory)
    {
        return
            abi.decode(data, (ILiquidityManager.MintParams));
    }

    // solhint-disable-next-line no-empty-blocks
    receive() external payable {}
}
