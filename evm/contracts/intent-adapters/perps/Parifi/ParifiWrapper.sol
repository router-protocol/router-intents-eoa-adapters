// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import {RouterIntentEoaAdapterWithoutDataProvider, EoaExecutorWithoutDataProvider} from "@routerprotocol/intents-core/contracts/RouterIntentEoaAdapter.sol";
import {IParifiOrderManager, Order, IParifiDataFabric} from "./Interfaces.sol";
import {IERC20, SafeERC20} from "../../../utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Errors} from "../../../Errors.sol";
import "hardhat/console.sol";

contract ParifiTargetDataStore is Ownable {
    mapping(address => bool) public targetWhitelist;
    address public stableProxy;
    address public syntheticProxy;

    constructor(
        address _owner,
        address _stableProxy,
        address _syntheticProxy
    ) {
        _transferOwnership(_owner);
        stableProxy = _stableProxy;
        syntheticProxy = _syntheticProxy;
    }

    /**
     * @notice function to update fee wallet for partner.
     * @param targets Array of Addresses of the target.
     */
    function updateParifiTargetList(
        address[] memory targets
    ) external onlyOwner {
        uint256 len = targets.length;

        require(len != 0, Errors.ARRAY_LENGTH_MISMATCH);

        for (uint i = 0; i < len; ) {
            targetWhitelist[targets[i]] = true;
            unchecked {
                ++i;
            }
        }
    }

    /**
     * @notice function to check whether an target is whitelisted.
     * @param target target by parifi team.
     */
    function isTargetWhitelisted(
        address target
    ) public view returns (bool) {
        return targetWhitelist[target];
    }

    /**
     * @notice function to set Fee wallet.
     * @param target target address to update
     */
    function removeTarget(address target) external onlyOwner{
        targetWhitelist[target] = false;
    }

    /**
     * @notice function to update stable Proxy.
     * @param _stableProxy addresses of the stable proxy for approvals.
     */
    function updateStableProxy(
        address _stableProxy
    ) external onlyOwner {
        require(_stableProxy != address(0), "zero address not allowed");
        stableProxy = _stableProxy;
    }

    /**
     * @notice function to update synthix Proxy.
     * @param _syntheticProxy addresses of the stable proxy for approvals.
     */
    function updateSyntheticProxy(
        address _syntheticProxy
    ) external onlyOwner {
        require(_syntheticProxy != address(0), "zero address not allowed");
        syntheticProxy = _syntheticProxy;
    }

}
contract ParifiIntentWrapper is RouterIntentEoaAdapterWithoutDataProvider {
    using SafeERC20 for IERC20;

    ParifiTargetDataStore public immutable parifiTarget;

    constructor(
        address __native,
        address __wnative,
        address __stableProxy,
        address __syntheticProxy

    ) RouterIntentEoaAdapterWithoutDataProvider(__native, __wnative) {

        parifiTarget = new ParifiTargetDataStore(
            msg.sender,
            __stableProxy,
            __syntheticProxy
        );
    }

    struct ParifiCall {
        address target;
        bool requireSuccess;
        uint256 value;
        bytes callData;
    }

    function name() public pure override returns (string memory) {
        return "ParifiIntentWrapper";
    }

    /**
     * @inheritdoc EoaExecutorWithoutDataProvider
     */
    function execute(
        bytes calldata data
    ) external payable override returns (address[] memory tokens) {
        (address[] memory token, uint256 amount, ParifiCall[] memory calls) = parseInputs(data);
        if (address(this) == self())
            IERC20(tokens[0]).safeTransferFrom(
                msg.sender,
                self(),
                amount
            );
        else if (amount == type(uint256).max)
            amount = IERC20(token[0]).balanceOf(address(this));

        for(uint256 i = 0; i < calls.length;) {
            address target = calls[i].target;
            require(parifiTarget.isTargetWhitelisted(target),"target not whitelisted");
            IERC20(token[0]).safeIncreaseAllowance(
                address(target),
                amount
            );
            unchecked { ++i; }
        }
        bytes memory logData;

        (tokens, logData) = _callParifiTargets(
            token,
            amount,
            calls
        );

        emit ExecutionEvent(name(), logData);
        return tokens;
    }

    //////////////////////////// ACTION LOGIC ////////////////////////////

    function _callParifiTargets(
        address[] memory token, 
        uint256 amount,
        ParifiCall[] memory calls
    ) internal returns (address[] memory tokens, bytes memory logData) {
        IERC20(token[0]).safeIncreaseAllowance(
            address(parifiTarget.stableProxy()),
            amount
        );
        IERC20(token[0]).safeIncreaseAllowance(
            address(parifiTarget.syntheticProxy()),
            amount
        );
        for (uint256 i = 0; i < calls.length;) {
            ParifiCall memory currentCall = calls[i];
            // Make the external call
            (bool success, bytes memory returnData) = currentCall.target.call(currentCall.callData);
            // If the call requires success and failed, revert the entire transaction
            if (currentCall.requireSuccess && !success) {
                revert(string(abi.encodePacked(
                    "Required call failed to: ",
                    address(currentCall.target),
                    ". Error: ",
                    string(returnData)
                )));
            }

            unchecked { ++i; }
        }
        tokens = new address[](1);
        tokens[0] = token[0];
        logData = abi.encode(token, amount);
    }

    /**
     * @dev function to parse input data.
     * @param data input data.
     */
    function parseInputs(bytes memory data) public pure returns (address[] memory, uint256, ParifiCall[] memory) {
        return abi.decode(data, (address[],uint256, ParifiCall[]));
    }

    // solhint-disable-next-line no-empty-blocks
    receive() external payable {}
}
