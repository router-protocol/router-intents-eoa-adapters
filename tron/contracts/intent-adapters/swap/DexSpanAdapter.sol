// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import {IDexSpan} from "../../interfaces/IDexSpan.sol";
import {RouterIntentEoaAdapterWithoutDataProvider, EoaExecutorWithoutDataProvider} from "@routerprotocol/intents-core/contracts/RouterIntentEoaAdapter.sol";
import {Errors} from "@routerprotocol/intents-core/contracts/utils/Errors.sol";
import {IERC20, SafeERC20} from "../../utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract DexSpanDataStore is Ownable {
    address public dexspan;

    constructor(address _owner, address _dexspan) {
        _transferOwnership(_owner);
        dexspan = _dexspan;
    }

    function setDexSpan(address _dexspan) external onlyOwner {
        dexspan = _dexspan;
    }
}

/**
 * @title DexSpanAdapter
 * @author Shivam Agrawal
 * @notice Swapping tokens using DexSpan contract
 */
contract DexSpanAdapter is RouterIntentEoaAdapterWithoutDataProvider {
    using SafeERC20 for IERC20;

    DexSpanDataStore public immutable dexSpanDataStore;

    constructor(
        address __native,
        address __wnative,
        address __dexspan
    ) RouterIntentEoaAdapterWithoutDataProvider(__native, __wnative) {
        dexSpanDataStore = new DexSpanDataStore(msg.sender, __dexspan);
    }

    function name() public pure override returns (string memory) {
        return "DexSpanAdapter";
    }

    /**
     * @inheritdoc EoaExecutorWithoutDataProvider
     */
    function execute(
        bytes calldata data
    ) external payable override returns (address[] memory tokens) {
        IDexSpan.SameChainSwapParams memory swapData = parseInputs(data);

        // If the adapter is called using `call` and not `delegatecall`
        if (address(this) == self()) {
            if (address(swapData.tokens[0]) != native())
                swapData.tokens[0].safeTransferFrom(
                    msg.sender,
                    self(),
                    swapData.amount
                );
            else
                require(
                    msg.value == swapData.amount,
                    Errors.INSUFFICIENT_NATIVE_FUNDS_PASSED
                );
        } else if (swapData.amount == type(uint256).max) {
            if (address(swapData.tokens[0]) != native())
                swapData.amount = swapData.tokens[0].balanceOf(address(this));
            else swapData.amount = address(this).balance;
        }

        bytes memory logData;

        (tokens, logData) = _swap(swapData);

        emit ExecutionEvent(name(), logData);
        return tokens;
    }

    //////////////////////////// ACTION LOGIC ////////////////////////////

    function _swap(
        IDexSpan.SameChainSwapParams memory _swapData
    ) internal returns (address[] memory tokens, bytes memory logData) {
        address dexspan = dexSpanDataStore.dexspan();

        withdrawTokens(address(_swapData.tokens[0]), dexspan, _swapData.amount);

        IDexSpan(dexspan).swapInSameChain(
            _swapData.tokens,
            _swapData.amount,
            _swapData.minReturn,
            _swapData.flags,
            _swapData.dataTx,
            true,
            _swapData.recipient,
            _swapData.widgetId
        );

        tokens = new address[](2);
        tokens[0] = address(_swapData.tokens[0]);
        tokens[1] = address(_swapData.tokens[_swapData.tokens.length - 1]);

        logData = abi.encode(_swapData.tokens, _swapData.amount);
    }

    /**
     * @dev function to parse input data.
     * @param data input data.
     */
    function parseInputs(
        bytes memory data
    ) public pure returns (IDexSpan.SameChainSwapParams memory) {
        IDexSpan.SameChainSwapParams memory swapData = abi.decode(
            data,
            (IDexSpan.SameChainSwapParams)
        );

        return swapData;
    }
}
