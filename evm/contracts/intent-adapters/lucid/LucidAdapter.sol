// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import {IBondTeller} from "./Interfaces.sol";
import {RouterIntentEoaAdapterWithoutDataProvider, EoaExecutorWithoutDataProvider} from "@routerprotocol/intents-core/contracts/RouterIntentEoaAdapter.sol";
import {Errors} from "@routerprotocol/intents-core/contracts/utils/Errors.sol";
import {IERC20, SafeERC20} from "../../utils/SafeERC20.sol";

/**
 * @title LucidAdapter
 * @author Yashika Goyal
 * @notice Purchasing a bond in Lucid FPA Market
 */
contract LucidAdapter is RouterIntentEoaAdapterWithoutDataProvider {
    using SafeERC20 for IERC20;

    address public immutable bondFixedExpiryTeller;
    address public immutable bondFixedTermTeller;

    constructor(
        address __native,
        address __wnative,
        address __bondFixedExpiryTeller,
        address __bondFixedTermTeller
    )
        RouterIntentEoaAdapterWithoutDataProvider(__native, __wnative)
    // solhint-disable-next-line no-empty-blocks
    {
        bondFixedExpiryTeller = __bondFixedExpiryTeller;
        bondFixedTermTeller = __bondFixedTermTeller;
    }

    function name() public pure override returns (string memory) {
        return "LucidAdapter";
    }

    /**
     * @inheritdoc EoaExecutorWithoutDataProvider
     */
    function execute(
        bytes calldata data
    ) external payable override returns (address[] memory tokens) {
        address bondTeller;
        IBondTeller.MintParams memory mintParams = parseInputs(data);

        // If the adapter is called using `call` and not `delegatecall`
        if (address(this) == self()) {
            if (mintParams.token != native())
                IERC20(mintParams.token).safeTransferFrom(
                    msg.sender,
                    self(),
                    mintParams.amount
                );
            else
                require(
                    msg.value == mintParams.amount,
                    Errors.INSUFFICIENT_NATIVE_FUNDS_PASSED
                );
        } else {
            if (mintParams.amount == type(uint256).max)
                mintParams.amount = getBalance(mintParams.token, address(this));
        }

        if (mintParams.token == native()) {
            convertNativeToWnative(mintParams.amount);
            mintParams.token = wnative();
        }

        if (mintParams.txType == 1) {
            bondTeller = bondFixedExpiryTeller;
        } else if (mintParams.txType == 2) {
            bondTeller = bondFixedTermTeller;
        }

        IERC20(mintParams.token).safeIncreaseAllowance(
            address(bondTeller),
            mintParams.amount
        );

        bytes memory logData;

        (tokens, logData) = _mint(bondTeller, mintParams);

        emit ExecutionEvent(name(), logData);
        return tokens;
    }

    //////////////////////////// ACTION LOGIC ////////////////////////////

    function _mint(
        address bondTeller,
        IBondTeller.MintParams memory mintParams
    ) internal returns (address[] memory tokens, bytes memory logData) {
        (uint256 payout, uint48 expiry) = IBondTeller(bondTeller).purchase(
            mintParams.recipient,
            mintParams.referrer,
            mintParams.id,
            mintParams.amount,
            mintParams.minAmountOut
        );

        tokens = new address[](1);
        tokens[0] = mintParams.token;

        logData = abi.encode(mintParams, payout, expiry);
    }

    /**
     * @dev function to parse input data.
     * @param data input data.
     */
    function parseInputs(
        bytes memory data
    ) public pure returns (IBondTeller.MintParams memory) {
        return abi.decode(data, (IBondTeller.MintParams));
    }

    // solhint-disable-next-line no-empty-blocks
    receive() external payable {}
}
