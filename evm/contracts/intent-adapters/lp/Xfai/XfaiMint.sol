// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import {IXfaiV0Periphery03} from "./Interfaces.sol";
import {RouterIntentEoaAdapterWithoutDataProvider, EoaExecutorWithoutDataProvider} from "@routerprotocol/intents-core/contracts/RouterIntentEoaAdapter.sol";
import {Errors} from "@routerprotocol/intents-core/contracts/utils/Errors.sol";
import {IERC20, SafeERC20} from "../../../utils/SafeERC20.sol";

/**
 * @title XfaiMint
 * @author Yashika Goyal
 * @notice Adding liquidity on Xfai.
 */

contract XfaiMint is RouterIntentEoaAdapterWithoutDataProvider {
    using SafeERC20 for IERC20;

    IXfaiV0Periphery03 public immutable xfaiPeriphery;

    constructor(
        address __native,
        address __wnative,
        address __xfaiPeriphery
    )
        RouterIntentEoaAdapterWithoutDataProvider(__native, __wnative)
    // solhint-disable-next-line no-empty-blocks
    {
        xfaiPeriphery = IXfaiV0Periphery03(__xfaiPeriphery);
    }

    function name() public pure override returns (string memory) {
        return "XfaiMint";
    }

    /**
     * @inheritdoc EoaExecutorWithoutDataProvider
     */
    function execute(
        bytes calldata data
    ) external payable override returns (address[] memory tokens) {
        IXfaiV0Periphery03.XfaiSupplyData memory mintParams = parseInputs(data);
        require(mintParams._token != native(), "XFAI: ERC20 token required");

        // If the adapter is called using `call` and not `delegatecall`
        if (address(this) == self()) {
            IERC20(mintParams._token).safeTransferFrom(
                msg.sender,
                self(),
                mintParams._amountTokenDesired
            );

            require(
                msg.value == mintParams._amountETHDesired,
                Errors.INSUFFICIENT_NATIVE_FUNDS_PASSED
            );
        } else {
            if (mintParams._amountTokenDesired == type(uint256).max)
                mintParams._amountTokenDesired = getBalance(
                    mintParams._token,
                    address(this)
                );

            if (mintParams._amountETHDesired == type(uint256).max)
                mintParams._amountETHDesired = getBalance(
                    native(),
                    address(this)
                );
        }

        IERC20(mintParams._token).safeIncreaseAllowance(
            address(xfaiPeriphery),
            mintParams._amountTokenDesired
        );

        uint liqAmount = _mint(mintParams);

        bytes memory logData = abi.encode(mintParams, liqAmount);

        tokens = new address[](2);
        tokens[0] = mintParams._token;
        tokens[1] = native();

        emit ExecutionEvent(name(), logData);
        return tokens;
    }

    //////////////////////////// ACTION LOGIC ////////////////////////////

    function _mint(
        IXfaiV0Periphery03.XfaiSupplyData memory _mintParams
    ) internal returns (uint liqAmount) {
        (liqAmount) = xfaiPeriphery.addLiquidity{
            value: _mintParams._amountETHDesired
        }(
            _mintParams._to,
            _mintParams._token,
            _mintParams._amountTokenDesired,
            _mintParams._amountTokenMin,
            _mintParams._amountETHMin,
            _mintParams._deadline
        );
    }

    /**
     * @dev function to parse input data.
     * @param data input data.
     */
    function parseInputs(
        bytes memory data
    ) public pure returns (IXfaiV0Periphery03.XfaiSupplyData memory) {
        return abi.decode(data, (IXfaiV0Periphery03.XfaiSupplyData));
    }

    // solhint-disable-next-line no-empty-blocks
    receive() external payable {}
}
