// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import {IVelocoreVault} from "./Interfaces.sol";
import {RouterIntentEoaAdapterWithoutDataProvider, EoaExecutorWithoutDataProvider} from "@routerprotocol/intents-core/contracts/RouterIntentEoaAdapter.sol";
import {Errors} from "@routerprotocol/intents-core/contracts/utils/Errors.sol";
import {IERC20, SafeERC20, SafeMath} from "../../../utils/SafeERC20.sol";
import {VelocoreHelpers} from "./VelocoreHelpers.sol";

/**
 * @title VelocoreMint
 * @author Yashika Goyal
 * @notice Adding liquidity on Velocore.
 */

contract VelocoreMint is
    RouterIntentEoaAdapterWithoutDataProvider,
    VelocoreHelpers
{
    using SafeERC20 for IERC20;
    using SafeMath for uint256;

    bytes32 public constant TOKEN_A_PREFIX =
        0x0000000000000000000000000000000000000000000000000000000000000000;
    bytes32 public constant TOKEN_B_PREFIX =
        0x0100000000000000000000000000000000000000000000000000000000000000;
    bytes32 public constant LP_TOKEN_PREFIX =
        0x0201000000000000000000000000000000000000000000000000000000000000;
    bytes32 public constant NATIVE_TOKEN =
        0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee;

    constructor(
        address __native,
        address __wnative,
        address __velocoreToken,
        address __velocoreVault
    )
        RouterIntentEoaAdapterWithoutDataProvider(__native, __wnative)
        VelocoreHelpers(__velocoreVault, __velocoreToken)
    // solhint-disable-next-line no-empty-blocks
    {
        
    }

    function name() public pure override returns (string memory) {
        return "VelocoreMint";
    }

    /**
     * @inheritdoc EoaExecutorWithoutDataProvider
     */
    function execute(
        bytes calldata data
    ) external payable override returns (address[] memory tokens) {
        IVelocoreVault.VelocoreSupplyData memory mintParams = parseInputs(data);

        // If the adapter is called using `call` and not `delegatecall`
        if (address(this) == self()) {
            if (mintParams.tokenA != native())
                IERC20(mintParams.tokenA).safeTransferFrom(
                    msg.sender,
                    self(),
                    mintParams.amountADesired
                );
            else
                require(
                    msg.value == mintParams.amountADesired,
                    Errors.INSUFFICIENT_NATIVE_FUNDS_PASSED
                );

            if (mintParams.tokenB != native())
                IERC20(mintParams.tokenB).safeTransferFrom(
                    msg.sender,
                    self(),
                    mintParams.amountBDesired
                );
            else
                require(
                    msg.value == mintParams.amountBDesired,
                    Errors.INSUFFICIENT_NATIVE_FUNDS_PASSED
                );
        } else {
            if (mintParams.amountADesired == type(uint256).max)
                mintParams.amountADesired = getBalance(
                    mintParams.tokenA,
                    address(this)
                );

            if (mintParams.amountBDesired == type(uint256).max)
                mintParams.amountBDesired = getBalance(
                    mintParams.tokenB,
                    address(this)
                );
        }

        uint256 liqAmount = _mint(mintParams);

        bytes memory logData = abi.encode(mintParams, liqAmount);

        tokens = new address[](3);
        tokens[0] = mintParams.tokenA;
        tokens[1] = mintParams.tokenB;
        tokens[2] = mintParams.lpToken;

        emit ExecutionEvent(name(), logData);
        return tokens;
    }

    //////////////////////////// ACTION LOGIC ////////////////////////////

    function _mint(
        IVelocoreVault.VelocoreSupplyData memory _mintParams
    ) internal returns (uint256 liqAmount) {
        uint256 value;
        bytes32 tokenABytes32;
        bytes32 tokenBBytes32;

        if (_mintParams.tokenA != native()) {
            if(_mintParams.tokenA != velocoreToken)
                IERC20(_mintParams.tokenA).safeIncreaseAllowance(
                    address(velocoreVault),
                    _mintParams.amountADesired
                );
            tokenABytes32 = bytes32(uint256(uint160(_mintParams.tokenA)));
        } else {
            tokenABytes32 = NATIVE_TOKEN;
            value = _mintParams.amountADesired;
        }

        if (_mintParams.tokenB != native()) {
            if(_mintParams.tokenB != velocoreToken)
                IERC20(_mintParams.tokenB).safeIncreaseAllowance(
                    address(velocoreVault),
                    _mintParams.amountBDesired
                );
            tokenBBytes32 = bytes32(uint256(uint160(_mintParams.tokenB)));
        } else {
            tokenBBytes32 = NATIVE_TOKEN;
            value = _mintParams.amountBDesired;
        }

        bytes32 lpTokenBytes32 = bytes32(uint256(uint160(_mintParams.lpToken)));

        bytes32 amountABytes32 = createBytes32(
            TOKEN_A_PREFIX,
            _mintParams.amountADesired
        );
        bytes32 amountBBytes32 = createBytes32(
            TOKEN_B_PREFIX,
            _mintParams.amountBDesired
        );
        bytes32 amountLPBytes32 = createBytes32(
            LP_TOKEN_PREFIX,
            type(uint128).max - 1
        );

        IVelocoreVault.Token[] memory tokensArray = new IVelocoreVault.Token[](
            3
        );
        tokensArray[0] = IVelocoreVault.Token.wrap(tokenABytes32);
        tokensArray[1] = IVelocoreVault.Token.wrap(tokenBBytes32);
        tokensArray[2] = IVelocoreVault.Token.wrap(lpTokenBytes32);

        bytes32[] memory amountsArray = new bytes32[](3);
        amountsArray[0] = amountABytes32;
        amountsArray[1] = amountBBytes32;
        amountsArray[2] = amountLPBytes32;

        int128[] memory depositAmountsArray = new int128[](3);
        depositAmountsArray[0] = 0;
        depositAmountsArray[1] = 0;
        depositAmountsArray[2] = 0;

        IVelocoreVault.VelocoreOperation[]
            memory velocoreOpsArray = new IVelocoreVault.VelocoreOperation[](1);
        velocoreOpsArray[0] = IVelocoreVault.VelocoreOperation(
            lpTokenBytes32,
            amountsArray,
            bytes("")
        );

        uint256 lpTokenBalBefore = IERC20(_mintParams.lpToken).balanceOf(
            address(this)
        );
        velocoreVault.execute{value: value}(
            tokensArray,
            depositAmountsArray,
            velocoreOpsArray
        );

        uint256 lpTokenBalAfter = IERC20(_mintParams.lpToken).balanceOf(
            address(this)
        );
        liqAmount = lpTokenBalAfter.sub(lpTokenBalBefore);

        IERC20(_mintParams.lpToken).safeTransfer(_mintParams.to, liqAmount);
    }

    /**
     * @dev function to parse input data.
     * @param data input data.
     */
    function parseInputs(
        bytes memory data
    ) public pure returns (IVelocoreVault.VelocoreSupplyData memory) {
        return abi.decode(data, (IVelocoreVault.VelocoreSupplyData));
    }

    function createBytes32(
        bytes32 prefix,
        uint256 tokenAmount
    ) public pure returns (bytes32) {
        bytes16 amountBytes = bytes16(uint128(tokenAmount));

        // Shift token amount bytes to the rightmost 16 bytes
        bytes32 shiftedAmountBytes = bytes32(amountBytes) >> 128;

        // Concatenate prefix and shifted token amount
        bytes32 result = prefix | shiftedAmountBytes;

        return result;
    }

    // solhint-disable-next-line no-empty-blocks
    receive() external payable {}
}
