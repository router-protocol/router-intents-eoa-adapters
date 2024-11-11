// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import {RouterIntentEoaAdapterWithoutDataProvider, EoaExecutorWithoutDataProvider} from "@routerprotocol/intents-core/contracts/RouterIntentEoaAdapter.sol";
import {Errors} from "@routerprotocol/intents-core/contracts/utils/Errors.sol";
import {IERC20, SafeERC20} from "../../utils/SafeERC20.sol";
import {TokenLaunchHelpers} from "./TokenLaunchHelpers.sol";
/**
 * @title Pre Sale Token Launch
 * @author Ateet Tiwari
 * @notice Pre sale token launch adapter
 */

contract TokenLaunch is RouterIntentEoaAdapterWithoutDataProvider, TokenLaunchHelpers {
    using SafeERC20 for IERC20;

    constructor(
        address __native,
        address __wnative,
        address __tokenPreminting
    )
        RouterIntentEoaAdapterWithoutDataProvider(__native, __wnative)
        TokenLaunchHelpers(__tokenPreminting)
    // solhint-disable-next-line no-empty-blocks
    {

    }

    function name() public pure override returns (string memory) {
        return "TokenLaunch";
    }

    /**
     * @inheritdoc EoaExecutorWithoutDataProvider
     */
    function execute(
        bytes calldata data
    ) external payable override returns (address[] memory tokens) {
        (address _tokenAddress, uint256 _amount, address _referrer, address _recipient) = parseInputs(data);
        if (address(this) == self()) {
            if (_tokenAddress != native())
                IERC20(_tokenAddress).safeTransferFrom(
                    msg.sender,
                    self(),
                    _amount
                );
            else
                require(
                    msg.value == _amount,
                    Errors.INSUFFICIENT_NATIVE_FUNDS_PASSED
                );
        } else if (_amount == type(uint256).max)
        {
            if (_tokenAddress == native()) {
                _amount = address(this).balance;
            } else {
            _amount = IERC20(_tokenAddress).balanceOf(address(this));
            }
        }
        if(_tokenAddress != native())
        {
            IERC20(_tokenAddress).safeIncreaseAllowance(
            address(tokenPreMinting),
            _amount
        );
        }
        
        bytes memory logData;
        (tokens, logData) = _buyTokens(_tokenAddress, _amount, _referrer, _recipient);
        emit ExecutionEvent(name(), logData);
        return tokens;
    }

    //////////////////////////// ACTION LOGIC ////////////////////////////

    function _buyTokens(
        address _tokenAddress, uint256 _amount, address _referrer, address _recipient
    ) internal returns (address[] memory tokens, bytes memory logData) {
        if(_tokenAddress == native())
        {
            tokenPreMinting.buyTokensETH{
                        value: _amount
                    }(_referrer, _recipient);
        }
        else {
            uint256 _newAmount = IERC20(_tokenAddress).balanceOf(address(this));
            tokenPreMinting.buyTokens(_tokenAddress, _newAmount, _referrer, _recipient);
        }
        tokens = new address[](1);
        tokens[0] = _tokenAddress;
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
        returns (address, uint256, address, address)
    {
        return
            abi.decode(data, (address, uint256, address, address));
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
