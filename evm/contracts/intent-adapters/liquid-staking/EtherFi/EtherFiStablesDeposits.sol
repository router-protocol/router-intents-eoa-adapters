// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import {IStablesDepositsVault} from "./Interfaces.sol";
import {RouterIntentEoaAdapterWithoutDataProvider, EoaExecutorWithoutDataProvider} from "@routerprotocol/intents-core/contracts/RouterIntentEoaAdapter.sol";
import {Errors} from "@routerprotocol/intents-core/contracts/utils/Errors.sol";
import {IERC20, SafeERC20} from "../../../utils/SafeERC20.sol";
import "hardhat/console.sol";

/**
 * @title EtherFiStablesDeposits
 * @author Ankush Kumar
 * @notice Staking Stables Tokens on EtherFi to receive liquidUSD.
 * @notice This contract is only for Ethereum chain.
 */
contract EtherFiStablesDeposits is RouterIntentEoaAdapterWithoutDataProvider {
    using SafeERC20 for IERC20;

    address public immutable liquidUSD;
    IStablesDepositsVault public immutable stablesDepositsVault;
    mapping(address => bool) public isStablecoin;

    constructor(
        address __native,
        address __wnative,
        address __liquidUSD,
        address __stablesDepositsVault,
        address[] memory stablecoins
    ) RouterIntentEoaAdapterWithoutDataProvider(__native, __wnative) {
        liquidUSD = __liquidUSD;
        stablesDepositsVault = IStablesDepositsVault(__stablesDepositsVault);

        for (uint256 i = 0; i < stablecoins.length; i++) {
            isStablecoin[stablecoins[i]] = true;
        }
    }

    function name() public pure override returns (string memory) {
        return "EtherFiStablesDeposits";
    }

    /**
     * @inheritdoc EoaExecutorWithoutDataProvider
     */
    function execute(
        bytes calldata data
    ) external payable override returns (address[] memory tokens) {
        console.log("Starting calling contracts:");
        (
            address _token,
            address _recipient,
            uint256 _amount,
            uint256 _minimumMint
        ) = parseInputs(data);
        console.log("_token:", _token);
        console.log("_recipient:", _recipient);
        console.log("_amount:", _amount, type(uint256).max);
        console.log("minimumMint:", _minimumMint);
        console.log("address(this):", address(this));
        console.log("self:", self());
        console.log("is Stable token passed:", isStablecoin[_token]);
        // require(isStablecoin[_token], "Only stablecoins are allowed");
        
        // If the adapter is called using `call` and not `delegatecall`
        if (address(this) == self()) {
            console.log("self", isStablecoin[_token]);
            IERC20(_token).safeTransferFrom(msg.sender, self(), _amount);
        } else if (_amount == type(uint256).max){
            console.log("max");
            _amount = IERC20(_token).balanceOf(address(this));
            console.log("_amount", _amount);
        }
            
        console.log("_amount", _amount);
        bytes memory logData;

        (tokens, logData) = _stake(_token, _recipient, _amount, _minimumMint);

        emit ExecutionEvent(name(), logData);
        return tokens;
    }

    //////////////////////////// ACTION LOGIC ////////////////////////////

    function _stake(
        address _token,
        address _recipient,
        uint256 _amount,
        uint256 _minimumMint
    ) internal returns (address[] memory tokens, bytes memory logData) {

        console.log("Staking Token:", _token);
        console.log("Recipient:", _recipient);
        console.log("Amount:", _amount);
        uint256 _receivedLiquidUSD;
        IERC20(_token).safeIncreaseAllowance(
            address(stablesDepositsVault),
            _amount
        );
        console.log("Allowance Done:");
        console.log("_token:", _token);
        console.log("_amount:", _amount);
        console.log("_minimumMint:", _minimumMint);
        _receivedLiquidUSD = stablesDepositsVault.deposit(
            _token,
            _amount,
            _minimumMint
        );

        console.log("_receivedLiquidUSD:", _receivedLiquidUSD);
        // uint256 _receivedLiquidUSD = IERC20(liquidUSD).balanceOf(address(this));
        tokens = new address[](2);
        tokens[0] = _token;
        tokens[1] = liquidUSD;
        // withdrawTokens(liquidUSD, _recipient, type(uint256).max);
        logData = abi.encode(_recipient, _amount, _receivedLiquidUSD);
    }

    /**
     * @dev function to parse input data.
     * @param data input data.
     */
    function parseInputs(
        bytes memory data
    ) public pure returns (address, address, uint256, uint256) {
        return abi.decode(data, (address, address, uint256, uint256));
    }

    // solhint-disable-next-line no-empty-blocks
    receive() external payable {}
}
