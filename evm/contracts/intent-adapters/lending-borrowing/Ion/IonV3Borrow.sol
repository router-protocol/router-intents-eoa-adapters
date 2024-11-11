// // SPDX-License-Identifier: MIT
// pragma solidity ^0.8.18;

// import {IonV3Helpers} from "./IonV3Helpers.sol";
// import {RouterIntentEoaAdapterWithoutDataProvider, EoaExecutorWithoutDataProvider} from "@routerprotocol/intents-core/contracts/RouterIntentEoaAdapter.sol";
// import {Errors} from "@routerprotocol/intents-core/contracts/utils/Errors.sol";
// import {IERC20, SafeERC20} from "../../../utils/SafeERC20.sol";

// /**
//  * @title IonV3Borrow
//  * @author Ateet Tiwari
//  * @notice Borrowing funds on IonV3.
//  */
// contract IonV3Borrow is RouterIntentEoaAdapterWithoutDataProvider, IonV3Helpers {
//     using SafeERC20 for IERC20;

//     constructor(
//         address __native,
//         address __wnative,
//         address __ionV3Pool,
//         address __ionV3WrappedTokenGateway,
//         uint16 __ionV3ReferralCode
//     )
//         RouterIntentEoaAdapterWithoutDataProvider(__native, __wnative)
//         IonV3Helpers(
//             __ionV3Pool,
//             __ionV3WrappedTokenGateway,
//             __ionV3ReferralCode
//         )
//     // solhint-disable-next-line no-empty-blocks
//     {

//     }

//     function name() public pure override returns (string memory) {
//         return "IonV3Borrow";
//     }

//     /**
//      * @inheritdoc EoaExecutorWithoutDataProvider
//      */
//     function execute(
//         bytes calldata data
//     ) external payable override returns (address[] memory tokens) {
//         (
//             uint256 amount,
//             uint256 rateMode,
//             address asset,
//             address onBehalfOf,
//             address recipient
//         ) = parseInputs(data);

//         bytes memory logData;

//         (tokens, logData) = _aaveV3Borrow(
//             amount,
//             rateMode,
//             asset,
//             onBehalfOf,
//             recipient
//         );

//         emit ExecutionEvent(name(), logData);
//         return tokens;
//     }

//     //////////////////////////// ACTION LOGIC ////////////////////////////

//     /**
//      * @notice function to borrow funds from AaveV3.
//      * @param amount Amount of asset to be borrowed.
//      * @param rateMode Rate mode for borrowing. 1 for Stable Rate and 2 for Variable Rate
//      * @param asset Asset to be borrowed.
//      * @param onBehalfOf The user who will incur the borrow.
//      */
//     function _aaveV3Borrow(
//         uint256 amount,
//         uint256 rateMode,
//         address asset,
//         address onBehalfOf,
//         address recipient
//     ) private returns (address[] memory tokens, bytes memory logData) {
//         aaveV3Pool.borrow(
//             asset,
//             amount,
//             rateMode,
//             aaveV3ReferralCode,
//             onBehalfOf
//         );

//         withdrawTokens(asset, recipient, amount);

//         tokens = new address[](1);
//         tokens[0] = asset;

//         logData = abi.encode(amount, rateMode, asset, onBehalfOf);
//     }

//     /**
//      * @dev function to parse input data.
//      * @param data input data.
//      */
//     function parseInputs(
//         bytes memory data
//     ) public pure returns (uint256, uint256, address, address, address) {
//         return abi.decode(data, (uint256, uint256, address, address, address));
//     }

//     // solhint-disable-next-line no-empty-blocks
//     receive() external payable {}
// }
