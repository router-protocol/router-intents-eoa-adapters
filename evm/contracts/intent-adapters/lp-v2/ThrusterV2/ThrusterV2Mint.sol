// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import {IThrusterV2Router} from "./Interfaces.sol";
import {RouterIntentEoaAdapterWithoutDataProvider, EoaExecutorWithoutDataProvider} from "@routerprotocol/intents-core/contracts/RouterIntentEoaAdapter.sol";
import {Errors} from "@routerprotocol/intents-core/contracts/utils/Errors.sol";
import {IERC20, SafeERC20} from "../../../utils/SafeERC20.sol";

/**
 * @title ThrusterV2Mint
 * @author Shivam Agrawal
 * @notice Adding liquidity on Thruster V2.
 */

contract ThrusterV2Mint is RouterIntentEoaAdapterWithoutDataProvider {
    using SafeERC20 for IERC20;

    IThrusterV2Router public immutable thrusterRouter_fee_point_thirty;
    IThrusterV2Router public immutable thrusterRouter_fee_one;

    constructor(
        address __native,
        address __wnative,
        address __thrusterRouter_fee_point_thirty,
        address __thrusterRouter_fee_one
    ) RouterIntentEoaAdapterWithoutDataProvider(__native, __wnative) {
        thrusterRouter_fee_point_thirty = IThrusterV2Router(
            __thrusterRouter_fee_point_thirty
        );
        thrusterRouter_fee_one = IThrusterV2Router(__thrusterRouter_fee_one);
    }

    function name() public pure override returns (string memory) {
        return "ThrusterV2Mint";
    }

    /**
     * @inheritdoc EoaExecutorWithoutDataProvider
     */
    function execute(
        bytes calldata data
    ) external payable override returns (address[] memory tokens) {
        IThrusterV2Router.ThrusterSupplyData memory mintParams = parseInputs(
            data
        );

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
            convertNativeToWnative(mintParams.amountBDesired);
            mintParams.tokenB = wnative();
        }

        IThrusterV2Router router;

        if (mintParams.fee == 3000) router = thrusterRouter_fee_point_thirty;
        else if (mintParams.fee == 10000) router = thrusterRouter_fee_one;
        else revert("Invalid fee");

        IERC20(mintParams.tokenA).safeIncreaseAllowance(
            address(router),
            mintParams.amountADesired
        );

        IERC20(mintParams.tokenB).safeIncreaseAllowance(
            address(router),
            mintParams.amountBDesired
        );

        (uint256 amountA, uint256 amountB, uint256 liqAmount) = _mint(
            router,
            mintParams
        );

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
        IThrusterV2Router router,
        IThrusterV2Router.ThrusterSupplyData memory _mintParams
    ) internal returns (uint256 amountA, uint256 amountB, uint256 liqAmount) {
        (amountA, amountB, liqAmount) = router.addLiquidity(
            _mintParams.tokenA,
            _mintParams.tokenB,
            _mintParams.amountADesired,
            _mintParams.amountBDesired,
            _mintParams.amountAMin,
            _mintParams.amountBMin,
            _mintParams.to,
            _mintParams.deadline
        );
    }

    /**
     * @dev function to parse input data.
     * @param data input data.
     */
    function parseInputs(
        bytes memory data
    ) public pure returns (IThrusterV2Router.ThrusterSupplyData memory) {
        return abi.decode(data, (IThrusterV2Router.ThrusterSupplyData));
    }

    // solhint-disable-next-line no-empty-blocks
    receive() external payable {}
}
