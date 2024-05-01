// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import {RouterIntentEoaAdapterWithoutDataProvider, EoaExecutorWithoutDataProvider} from "@routerprotocol/intents-core/contracts/RouterIntentEoaAdapter.sol";
import {IERC20, SafeERC20} from "../../../utils/SafeERC20.sol";
import {Errors} from "../../../Errors.sol";

interface IParifiFairsale {
    function depositFor(
        uint256 amount,
        address recipient
    ) external returns (uint256 tokenAmount);

    function stable() external view returns (IERC20);
}

/**
 * @title ParifiFairsale
 * @author @Shivam78288
 * @notice Participating in Fairsale for Parifi's PRF token.
 */
contract ParifiFairsale is RouterIntentEoaAdapterWithoutDataProvider {
    using SafeERC20 for IERC20;

    IParifiFairsale public immutable parifiFairsaleContract;
    IERC20 public immutable stable;

    constructor(
        address __native,
        address __wnative,
        address __parifiFairsaleContract
    ) RouterIntentEoaAdapterWithoutDataProvider(__native, __wnative) {
        parifiFairsaleContract = IParifiFairsale(__parifiFairsaleContract);
        stable = parifiFairsaleContract.stable();
    }

    function name() public pure override returns (string memory) {
        return "ParifiFairsale";
    }

    /**
     * @inheritdoc EoaExecutorWithoutDataProvider
     */
    function execute(
        bytes calldata data
    ) external payable override returns (address[] memory tokens) {
        (address recipient, uint256 amount) = parseInputs(data);

        // If the adapter is called using `call` and not `delegatecall`
        if (address(this) == self()) {
            stable.safeTransferFrom(msg.sender, self(), amount);
        } else if (amount == type(uint256).max)
            amount = stable.balanceOf(address(this));

        bytes memory logData;

        (tokens, logData) = _depositIntoParifi(amount, recipient);

        emit ExecutionEvent(name(), logData);

        return tokens;
    }

    //////////////////////////// ACTION LOGIC ////////////////////////////

    function _depositIntoParifi(
        uint256 amount,
        address recipient
    ) internal returns (address[] memory tokens, bytes memory logData) {
        stable.safeIncreaseAllowance(address(parifiFairsaleContract), amount);

        uint256 prfTokenAmount = parifiFairsaleContract.depositFor(
            amount,
            recipient
        );

        tokens = new address[](1);
        tokens[0] = address(stable);

        logData = abi.encode(amount, prfTokenAmount);
    }

    /**
     * @dev function to parse input data.
     * @param data input data.
     */
    function parseInputs(
        bytes memory data
    ) public pure returns (address, uint256) {
        return abi.decode(data, (address, uint256));
    }

    // solhint-disable-next-line no-empty-blocks
    receive() external payable {}
}
