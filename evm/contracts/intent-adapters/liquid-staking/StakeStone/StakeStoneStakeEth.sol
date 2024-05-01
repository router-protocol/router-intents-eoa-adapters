// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import {IStoneVault, ILzOft} from "./Interfaces.sol";
import {RouterIntentEoaAdapterWithoutDataProvider, EoaExecutorWithoutDataProvider} from "@routerprotocol/intents-core/contracts/RouterIntentEoaAdapter.sol";
import {Errors} from "@routerprotocol/intents-core/contracts/utils/Errors.sol";
import {IERC20, SafeERC20} from "../../../utils/SafeERC20.sol";

/**
 * @title StakeStoneStake
 * @author Yashika Goyal
 * @notice Staking ETH to receive STONE on StakeStone.
 */
contract StakeStoneStakeEth is RouterIntentEoaAdapterWithoutDataProvider {
    using SafeERC20 for IERC20;

    address public immutable stone;
    IStoneVault public immutable stoneVault;

    constructor(
        address __native,
        address __wnative,
        address __stoneVault,
        address __stone
    ) RouterIntentEoaAdapterWithoutDataProvider(__native, __wnative) {
        stoneVault = IStoneVault(__stoneVault);
        stone = __stone;
    }

    function name() public pure override returns (string memory) {
        return "StakeStoneStake";
    }

    /**
     * @inheritdoc EoaExecutorWithoutDataProvider
     */
    function execute(
        bytes calldata data
    ) external payable override returns (address[] memory tokens) {
        (address _recipient, uint256 _amount, uint16 dstEid, bytes memory crossChainData) = parseInputs(data);

        uint256 nativeFee = 0;
        if (dstEid != 0) nativeFee = abi.decode(crossChainData, (uint256));

        // If the adapter is called using `call` and not `delegatecall`
        if (address(this) == self()) {
            require(
                msg.value == _amount,
                Errors.INSUFFICIENT_NATIVE_FUNDS_PASSED
            );
            _amount = msg.value - nativeFee;
        } else if (_amount == type(uint256).max)
            _amount = address(this).balance - nativeFee;
        
        else {_amount = _amount - nativeFee;}

        bytes memory logData;
        (tokens, logData) = _stake(_recipient, _amount, dstEid, crossChainData);

        emit ExecutionEvent(name(), logData);
        return tokens;
    }

    //////////////////////////// ACTION LOGIC ////////////////////////////

    function _stake(
        address _recipient,
        uint256 _amount,
        uint16 dstEid,
        bytes memory crossChainData
    ) internal returns (address[] memory tokens, bytes memory logData) {
        uint256 receivedStone = stoneVault.deposit{value: _amount}();

        if (dstEid != 0) {
            depositLzOFT(dstEid, crossChainData, receivedStone, _recipient);
        } else {
            if (_recipient != address(this))
                withdrawTokens(stone, _recipient, receivedStone);
        }        

        tokens = new address[](2);
        tokens[0] = native();
        tokens[1] = stone;

        logData = abi.encode(_recipient, _amount, receivedStone);
    }

    function depositLzOFT(
        uint16 dstEid,
        bytes memory crossChainData,
        uint256 amount,
        address recipient
    ) public {
        (uint256 nativeFee, address refundAddress) = abi.decode(
            crossChainData,
            (uint256, address)
        );

        ILzOft(stone).sendFrom{value: nativeFee}(address(this), dstEid, abi.encodePacked(recipient), amount, payable(refundAddress), address(0) , hex"");
    }

    /**
     * @dev function to parse input data.
     * @param data input data.
     */
    function parseInputs(
        bytes memory data
    ) public pure returns (address, uint256, uint16, bytes memory) {
        return abi.decode(data, (address, uint256, uint16, bytes));
    }

    // solhint-disable-next-line no-empty-blocks
    receive() external payable {}
}
