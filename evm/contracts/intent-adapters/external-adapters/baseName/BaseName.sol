// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import {IBaseRegisterRouter} from "./Interface.sol";
import {RouterIntentEoaAdapterWithoutDataProvider, EoaExecutorWithoutDataProvider} from "@routerprotocol/intents-core/contracts/RouterIntentEoaAdapter.sol";
import {Errors} from "@routerprotocol/intents-core/contracts/utils/Errors.sol";
import {IERC20, SafeERC20} from "../../../utils/SafeERC20.sol";
import {BaseNameRegistryHelpers} from "./BaseNameHelpers.sol";
/**
 * @title Base Name Registry
 * @author Ateet Tiwari
 * @notice External adapter to add name to base chain
 */

contract BaseNameRegistry is RouterIntentEoaAdapterWithoutDataProvider, BaseNameRegistryHelpers {
    using SafeERC20 for IERC20;

    constructor(
        address __native,
        address __wnative,
        address __baseRegistry
    )
        RouterIntentEoaAdapterWithoutDataProvider(__native, __wnative)
        BaseNameRegistryHelpers(__baseRegistry)
    // solhint-disable-next-line no-empty-blocks
    {

    }

    function name() public pure override returns (string memory) {
        return "BaseRegistry";
    }

    /**
     * @inheritdoc EoaExecutorWithoutDataProvider
     */
    function execute(
        bytes calldata data
    ) external payable override returns (address[] memory tokens) {
        (address _recipient, uint256 _amount, IBaseRegisterRouter.RegisterRequest memory registeryData) = parseInputs(data);
        // If the adapter is called using `call` and not `delegatecall`
        if (address(this) == self()) {
            require(
                msg.value == _amount,
                Errors.INSUFFICIENT_NATIVE_FUNDS_PASSED
            );
        } else if (_amount == type(uint256).max)
            _amount = address(this).balance;

        bytes memory logData;
        (tokens, logData) = _registry(_recipient, _amount, registeryData);
        emit ExecutionEvent(name(), logData);
        return tokens;
    }

    //////////////////////////// ACTION LOGIC ////////////////////////////

    function _registry(
        address _recipient,
        uint256 _amount,
        IBaseRegisterRouter.RegisterRequest memory _registryParams
    ) internal returns (address[] memory tokens, bytes memory logData) {
        uint priceRequired = registerModule.registerPrice(_registryParams.name, _registryParams.duration);
        require(_amount > priceRequired, "amount supplied is lesser than required");
        registerModule.register{value: priceRequired}(_registryParams); 
        tokens = new address[](1);
        tokens[0] = native();
        logData = abi.encode(_recipient, _amount, true);
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
        returns (address, uint256, IBaseRegisterRouter.RegisterRequest memory)
    {
        return
            abi.decode(data, (address, uint256, IBaseRegisterRouter.RegisterRequest));
    }

    /**
     * @dev function to parse input data for registry.
     * @param data input data.
     */
    function parseInputsRegistry(
        bytes memory data
    )
        public
        pure
        returns (string memory,
        address,
        uint256,
        address,
        bytes[] memory,
        bool)
    {
        return
            abi.decode(data, (
        string,
        address,
        uint256,
        address,
        bytes[],
        bool));
    }

    // solhint-disable-next-line no-empty-blocks
    receive() external payable {}
}
