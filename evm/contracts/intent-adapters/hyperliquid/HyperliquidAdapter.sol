// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import {IHyperliquidBridge} from "./Interfaces.sol";
import {RouterIntentEoaAdapterWithoutDataProvider, EoaExecutorWithoutDataProvider} from "@routerprotocol/intents-core/contracts/RouterIntentEoaAdapter.sol";
import {Errors} from "@routerprotocol/intents-core/contracts/utils/Errors.sol";
import {IERC20, SafeERC20} from "../../utils/SafeERC20.sol";

/**
 * @title HyperliquidAdapter
 * @author Yashika Goyal
 * @notice Depositing USDC to Hyperliquid Deposit Bridge.
 */
contract HyperliquidAdapter is RouterIntentEoaAdapterWithoutDataProvider {
    using SafeERC20 for IERC20;

    address public immutable usdc;
    IHyperliquidBridge public immutable hyperliquidDepositBridge;

    constructor(
        address __native,
        address __wnative,
        address __usdc,
        address __hyperliquidDepositBridge
    ) RouterIntentEoaAdapterWithoutDataProvider(__native, __wnative) {
        usdc = __usdc;
        hyperliquidDepositBridge = IHyperliquidBridge(
            __hyperliquidDepositBridge
        );
    }

    function name() public pure override returns (string memory) {
        return "HyperliquidAdapter";
    }

    /**
     * @inheritdoc EoaExecutorWithoutDataProvider
     */
    function execute(
        bytes calldata data
    ) external payable override returns (address[] memory tokens) {
        (
            address user,
            uint64 usd,
            uint64 deadline,
            IHyperliquidBridge.Signature memory signature
        ) = parseInputs(data);

        // If the adapter is called using `call` and not `delegatecall`
        if (address(this) == self()) {
            IERC20(usdc).safeTransferFrom(msg.sender, self(), usd);
        } else if (usd == type(uint64).max)
            usd = uint64(IERC20(usdc).balanceOf(address(this)));

        bytes memory logData;

        (tokens, logData) = _deposit(user, usd, deadline, signature);

        emit ExecutionEvent(name(), logData);
        return tokens;
    }

    //////////////////////////// ACTION LOGIC ////////////////////////////

    function _deposit(
        address user,
        uint64 usd,
        uint64 deadline,
        IHyperliquidBridge.Signature memory signature
    ) internal returns (address[] memory tokens, bytes memory logData) {
        IERC20(usdc).safeIncreaseAllowance(
            address(hyperliquidDepositBridge),
            usd
        );
        
        IHyperliquidBridge.DepositWithPermit[] memory deposits;

        deposits[0] = IHyperliquidBridge.DepositWithPermit({
            user: user,
            usd: usd,
            deadline: deadline,
            signature: signature
        });

        hyperliquidDepositBridge.batchedDepositWithPermit(deposits);

        tokens = new address[](1);
        tokens[0] = usdc;

        logData = abi.encode(user, usd);
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
        returns (address, uint64, uint64, IHyperliquidBridge.Signature memory)
    {
        return
            abi.decode(
                data,
                (address, uint64, uint64, IHyperliquidBridge.Signature)
            );
    }

    // solhint-disable-next-line no-empty-blocks
    receive() external payable {}
}
