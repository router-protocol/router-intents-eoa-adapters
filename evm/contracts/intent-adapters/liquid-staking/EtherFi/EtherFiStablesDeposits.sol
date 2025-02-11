// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import {IStablesDepositsVault} from "./Interfaces.sol";
import {RouterIntentEoaAdapterWithoutDataProvider, EoaExecutorWithoutDataProvider} from "@routerprotocol/intents-core/contracts/RouterIntentEoaAdapter.sol";
import {Errors} from "@routerprotocol/intents-core/contracts/utils/Errors.sol";
import {IERC20, SafeERC20} from "../../../utils/SafeERC20.sol";

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
        (address _token, address _recipient, uint256 _amount, uint256 _minimumMint) = parseInputs(
            data
        );

        require(isStablecoin[_token], "Only stablecoins are allowed");

        // If the adapter is called using `call` and not `delegatecall`
        if (address(this) == self()) {
            IERC20(_token).safeTransferFrom(msg.sender, self(), _amount);
        } else if (_amount == type(uint256).max)
            _amount = IERC20(_token).balanceOf(address(this));

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
        uint256 _receivedLiquidUSD;
            IERC20(_token).safeIncreaseAllowance(
                address(stablesDepositsVault),
                _amount
            );
            _receivedLiquidUSD = stablesDepositsVault.deposit(
                _token,
                _amount,
                _minimumMint
            );

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
