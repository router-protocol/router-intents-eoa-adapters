// // SPDX-License-Identifier: MIT
// pragma solidity ^0.8.18;

// import {IonV3Helpers} from "./IonV3Helpers.sol";
// import {RouterIntentEoaAdapterWithoutDataProvider, EoaExecutorWithoutDataProvider} from "@routerprotocol/intents-core/contracts/RouterIntentEoaAdapter.sol";
// import {Errors} from "@routerprotocol/intents-core/contracts/utils/Errors.sol";
// import {IERC20, SafeERC20} from "../../../utils/SafeERC20.sol";

// /**
//  * @title IonV3Supply
//  * @author Ateet Tiwari
//  * @notice Supplying funds on IonV3.
//  */
// contract IonV3Supply is RouterIntentEoaAdapterWithoutDataProvider, IonV3Helpers {
//     using SafeERC20 for IERC20;

//     constructor(
//         address __native,
//         address __wnative,
//         address __IonV3Pool,
//         address __IonV3WrappedTokenGateway,
//         uint16 __IonV3ReferralCode
//     )
//         RouterIntentEoaAdapterWithoutDataProvider(__native, __wnative)
//         IonV3Helpers(
//             __IonV3Pool,
//             __IonV3WrappedTokenGateway,
//             __IonV3ReferralCode
//         )
//     // solhint-disable-next-line no-empty-blocks
//     {

//     }

//     function name() public pure override returns (string memory) {
//         return "IonV3Supply";
//     }

//     /**
//      * @inheritdoc EoaExecutorWithoutDataProvider
//      */
//     function execute(
//         bytes calldata data
//     ) external payable override returns (address[] memory tokens) {
//         (address _asset, address _recipient, uint256 _amount) = parseInputs(
//             data
//         );

//         // If the adapter is called using `call` and not `delegatecall`
//         if (address(this) == self()) {
//             if (_asset == native())
//                 require(
//                     msg.value == _amount,
//                     Errors.INSUFFICIENT_NATIVE_FUNDS_PASSED
//                 );
//             else IERC20(_asset).safeTransferFrom(msg.sender, self(), _amount);
//         } else if (_amount == type(uint256).max)
//             _amount = getBalance(_asset, address(this));

//         bytes memory logData;

//         (tokens, logData) = _ionV3Supply(_asset, _recipient, _amount);

//         emit ExecutionEvent(name(), logData);
//         return tokens;
//     }

//     //////////////////////////// ACTION LOGIC ////////////////////////////

//     /**
//      * @notice function to supply funds to IonV3.
//      * @param amount Amount of supply asset to be supplied.
//      * @param recipient Recipient of aTokens after funds have been supplied.
//      * @param asset Asset to be supplied.
//      */
//     function _ionV3Supply(
//         address asset,
//         address recipient,
//         uint256 amount
//     ) private returns (address[] memory tokens, bytes memory logData) {
//         approveToken(asset, address(ionV3Pool), amount);

//         if (asset == native())
//             IonV3WrappedTokenGateway.depositETH{value: amount}(
//                 address(0),
//                 recipient,
//                 IonV3ReferralCode
//             );
//         else IonV3Pool.supply(asset, amount, recipient, IonV3ReferralCode);

//         tokens = new address[](1);
//         tokens[0] = asset;

//         logData = abi.encode(asset, recipient, amount);
//     }

//     /**
//      * @dev function to parse input data.
//      * @param data input data.
//      */
//     function parseInputs(
//         bytes memory data
//     ) public pure returns (address, address, uint256) {
//         return abi.decode(data, (address, address, uint256));
//     }

//     // solhint-disable-next-line no-empty-blocks
//     receive() external payable {}
// }
