// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import {IPendleRouter} from "./Interfaces.sol";
import {RouterIntentEoaAdapterWithoutDataProvider, EoaExecutorWithoutDataProvider} from "@routerprotocol/intents-core/contracts/RouterIntentEoaAdapter.sol";
import {Errors} from "@routerprotocol/intents-core/contracts/utils/Errors.sol";
import {IERC20, SafeERC20} from "../../../utils/SafeERC20.sol";
import {PendleHelpers} from "./PendleHelpers.sol";

/**
 * @title PendleMint
 * @author Yashika Goyal
 * @notice Adding liquidity on Pendle.
 */

contract PendleMint is RouterIntentEoaAdapterWithoutDataProvider, PendleHelpers {
    using SafeERC20 for IERC20;

    constructor(
        address __native,
        address __wnative,
        address __pendleRouter
    )
        RouterIntentEoaAdapterWithoutDataProvider(__native, __wnative)
        PendleHelpers(__pendleRouter)
    // solhint-disable-next-line no-empty-blocks
    {

    }

    function name() public pure override returns (string memory) {
        return "PendleMint";
    }

    /**
     * @inheritdoc EoaExecutorWithoutDataProvider
     */
    function execute(
        bytes calldata data
    ) external payable override returns (address[] memory tokens) {
        IPendleRouter.PendleSupplyData
            memory mintParams = parseInputs(data);

        // If the adapter is called using `call` and not `delegatecall`
        if (address(this) == self()) {
            if (mintParams.input.tokenIn != native())
                IERC20(mintParams.input.tokenIn).safeTransferFrom(
                    msg.sender,
                    self(),
                    mintParams.input.netTokenIn
                );
            else
                require(
                    msg.value == mintParams.input.netTokenIn,
                    Errors.INSUFFICIENT_NATIVE_FUNDS_PASSED
                );
        } else {
            if (mintParams.input.netTokenIn == type(uint256).max)
                mintParams.input.netTokenIn = getBalance(
                    mintParams.input.tokenIn,
                    address(this)
                );
        }

        if (mintParams.input.tokenIn == native()) {
            convertNativeToWnative(mintParams.input.netTokenIn);
            mintParams.input.tokenIn = wnative();
        }

        IERC20(mintParams.input.tokenIn).safeIncreaseAllowance(
            address(pendleRouter),
            mintParams.input.netTokenIn
        );

        (uint256 netLpOut, uint256 netSyFee, uint256 netSyInterm) = _mint(mintParams);

        bytes memory logData = abi.encode(
            mintParams,
            netLpOut, 
            netSyFee, 
            netSyInterm
        );

        tokens = new address[](1);
        tokens[0] = mintParams.input.tokenIn;

        emit ExecutionEvent(name(), logData);
        return tokens;
    }

    //////////////////////////// ACTION LOGIC ////////////////////////////

    function _mint(
        IPendleRouter.PendleSupplyData memory _mintParams
    ) internal returns (uint256 netLpOut, uint256 netSyFee, uint256 netSyInterm) {
            (netLpOut, netSyFee, netSyInterm) = pendleRouter.addLiquiditySingleToken(
                _mintParams.receiver,
                _mintParams.market,
                _mintParams.minLpOut,
                _mintParams.guessPtReceivedFromSy,
                _mintParams.input,
                _mintParams.limit
            );
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
        returns (IPendleRouter.PendleSupplyData memory)
    {
        return
            abi.decode(data, (IPendleRouter.PendleSupplyData));
    }

    // solhint-disable-next-line no-empty-blocks
    receive() external payable {}
}
