// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import {ISBTCVault, ISBTCLzAdapter} from "./Interfaces.sol";
import {RouterIntentEoaAdapterWithoutDataProvider, EoaExecutorWithoutDataProvider} from "@routerprotocol/intents-core/contracts/RouterIntentEoaAdapter.sol";
import {Errors} from "@routerprotocol/intents-core/contracts/utils/Errors.sol";
import {IERC20, SafeERC20} from "../../../utils/SafeERC20.sol";

/**
 * @title StakeStoneStakeBTC
 * @author Yashika Goyal
 * @notice Staking Tokens on StakeStone (Ethereum & BNB) to receive SBTC
 */
contract StakeStoneStakeBTC is RouterIntentEoaAdapterWithoutDataProvider {
    using SafeERC20 for IERC20;

    address public immutable sBTC;
    ISBTCVault public immutable sBTCVault;
    ISBTCLzAdapter public immutable sBTCLzAdapter;

    constructor(
        address __native,
        address __wnative,
        address __sBTC,
        address __sBTCVault,
        address __sBTCLZAdapter
    ) RouterIntentEoaAdapterWithoutDataProvider(__native, __wnative) {
        sBTC = __sBTC;
        sBTCVault = ISBTCVault(__sBTCVault);
        sBTCLzAdapter = ISBTCLzAdapter(__sBTCLZAdapter);
    }

    function name() public pure override returns (string memory) {
        return "StakeStoneStakeBTC";
    }

    /**
     * @inheritdoc EoaExecutorWithoutDataProvider
     */
    function execute(
        bytes calldata data
    ) external payable override returns (address[] memory tokens) {
        (
            address _token,
            address _recipient,
            uint256 _amount,
            uint32 dstEid,
            bytes memory crossChainData
        ) = parseInputs(data);

        // If the adapter is called using `call` and not `delegatecall`
        if (address(this) == self()) {
            IERC20(_token).safeTransferFrom(msg.sender, self(), _amount);
        } else if (_amount == type(uint256).max)
            _amount = IERC20(_token).balanceOf(address(this));

        bytes memory logData;

        (tokens, logData) = _stake(_token, _recipient, _amount, dstEid, crossChainData);

        emit ExecutionEvent(name(), logData);
        return tokens;
    }

    //////////////////////////// ACTION LOGIC ////////////////////////////

    function _stake(
        address _token,
        address _recipient,
        uint256 _amount,
        uint32 dstEid,
        bytes memory crossChainData
    ) internal returns (address[] memory tokens, bytes memory logData) {
        IERC20(_token).safeIncreaseAllowance(address(sBTCVault), _amount);
        sBTCVault.deposit(_token, _amount);
        uint256 _receivedsBTC = IERC20(sBTC).balanceOf(address(this));
        tokens = new address[](2);
        tokens[0] = _token;
        tokens[1] = sBTC;

        if (dstEid != 0) {
            ISBTCLzAdapter.MessagingReceipt memory receipt;
            ISBTCLzAdapter.OFTReceipt memory oftReceipt;

            (receipt, oftReceipt) = depositLzOFT(dstEid, crossChainData, _receivedsBTC, _recipient);

            logData = abi.encode(_recipient, _amount, _receivedsBTC, receipt, oftReceipt);
        } else {
            if (_recipient != address(this))
                withdrawTokens(sBTC, _recipient, type(uint256).max);

            logData = abi.encode(_recipient, _amount, _receivedsBTC);
        }
    }

    function depositLzOFT(
        uint32 dstEid,
        bytes memory crossChainData,
        uint256 amount,
        address recipient
    )
        public
        returns (
            ISBTCLzAdapter.MessagingReceipt memory receipt,
            ISBTCLzAdapter.OFTReceipt memory oftReceipt
        )
    {
        (
            uint256 nativeFee,
            uint256 minAmount,
            address refundAddress
        ) = abi.decode(crossChainData, (uint256, uint256, address));

        ISBTCLzAdapter.SendParam memory sendParam = ISBTCLzAdapter.SendParam({
            dstEid: dstEid,
            to: bytes32(uint256(uint160(address(recipient)))),
            amountLD: amount,
            minAmountLD: minAmount,
            extraOptions: hex"",
            composeMsg: hex"",
            oftCmd: hex""
        });

        ISBTCLzAdapter.MessagingFee memory fee = ISBTCLzAdapter.MessagingFee({
            nativeFee: nativeFee,
            lzTokenFee: uint256(0)
        });
        (receipt, oftReceipt) = sBTCLzAdapter.send{value: nativeFee}(
            sendParam,
            fee,
            payable(refundAddress)
        );
        return (receipt, oftReceipt);
    }

    /**
     * @dev function to parse input data.
     * @param data input data.
     */
    function parseInputs(
        bytes memory data
    ) public pure returns (address, address, uint256, uint32, bytes memory) {
        return abi.decode(data, (address, address, uint256, uint32, bytes));
    }

    // solhint-disable-next-line no-empty-blocks
    receive() external payable {}
}
