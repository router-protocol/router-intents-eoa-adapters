// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import {RouterIntentEoaAdapterWithoutDataProvider, EoaExecutorWithoutDataProvider} from "@routerprotocol/intents-core/contracts/RouterIntentEoaAdapter.sol";
import {Errors} from "../../Errors.sol";
import {IERC20, SafeERC20} from "../../utils/SafeERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
/**
 * @title FeeAdapter
 * @author Ateet Tiwari
 * @notice Adapter for Fee Deductions
 */
contract FeeAdapter is RouterIntentEoaAdapterWithoutDataProvider, AccessControl {
    using SafeERC20 for IERC20;

    address public feeWallet;
    address public batchHandler;
    uint256 private batchHandlerFeeInBeps;
    mapping(uint256 => address) private feeWalletWhitelist;

    bytes32 public constant SETTER_ROLE = keccak256("SETTER_ROLE");

    constructor(
        address __native,
        address __wnative,
        address __feeWallet,
        uint16 __batchHandlerFee,
        address __batchHandler
    )
        RouterIntentEoaAdapterWithoutDataProvider(__native, __wnative)
    // solhint-disable-next-line no-empty-blocks
    {
        feeWallet = __feeWallet;
        batchHandlerFeeInBeps = __batchHandlerFee;
        batchHandler = __batchHandler;
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(SETTER_ROLE, msg.sender);

    }

     /**
     * @notice modifier to ensure that only Batch Handler can call fees handler function
     */
    modifier onlyBatchHandler() {
        _onlyBatchHandler();
        _;
    }

    function _onlyBatchHandler() private view {
        require(
            msg.sender == batchHandler,
            "Only Batch Handler calls allowed"
        );
    }

    function name() public pure override returns (string memory) {
        return "BatchHandlerFeeAdapter";
    }

    /**
     * @inheritdoc EoaExecutorWithoutDataProvider
     */
    function execute(
        bytes calldata data
    ) external payable override onlyBatchHandler returns (address[] memory tokens) {
        (uint256[] memory _appId, uint96[] memory _fee, address[] memory _tokens, uint256[] memory _amounts, bool _isActive) = parseInputs(
            data
        );
        uint256 appIdLength = _appId.length;

        require(
            appIdLength == _fee.length,
            Errors.ARRAY_LENGTH_MISMATCH
        );

        require(
            _tokens.length == _amounts.length,
            Errors.ARRAY_LENGTH_MISMATCH
        );

        uint256 tokenLength = _tokens.length;
       
        for(uint256 x = 0; x < tokenLength; )
        {
             if(_isActive)
            {
                uint256 fee = (_amounts[x]*batchHandlerFeeInBeps)/10000;
                if (fee > (_amounts[x] * 500) / 10000)
                    revert(Errors.FEE_EXCEEDS_MAX_BIPS);
                withdrawTokens(
                        _tokens[x],
                        feeWallet,
                        uint256(fee)
                    );
            }
            for (uint256 i = 0; i < appIdLength; ) {
            uint256 appId = _appId[i];
            if (feeWalletWhitelist[appId] != address(0)) {
                if (_fee[i] > (_amounts[x] * 500) / 10000)
                    revert(Errors.FEE_EXCEEDS_MAX_BIPS);
                withdrawTokens(
                    _tokens[x],
                    feeWalletWhitelist[appId],
                    uint256(_fee[i])
                );
            }
            else
            {
                revert("Fee Params not present for appId");
            }

            unchecked {
                ++i;
            }
        }

            unchecked {
                ++x;
            }

        }

        return _tokens;
    }

    /**
     * @notice function to check whether an adapter is whitelisted.
     * @param appId appId of partner.
     */
    function isAppIdFeeWalletWhitelisted(uint256 appId, address feeWallet) public view returns (bool) {
        require(feeWalletWhitelist[appId] == feeWallet, "fee wallet not correct for app id");
    }

    /**
     * @notice function to check whether an adapter is whitelisted.
     * @param appId appId of partner.
     */
    function AppIdInfo(uint256 appId) public view returns (address) {
        return feeWalletWhitelist[appId];
    }

    /**
     * @notice function to update fee wallet for partner.
     * @param appId appId for partner.
     * @param feeWallet Addresses of the partner fee wallet.
     */
    function updateFeeWalletForAppId(
        uint256 appId,
        address feeWallet
    ) external onlyRole(SETTER_ROLE) {
        feeWalletWhitelist[appId] = feeWallet;
    }

    /**
     * @notice function to set batch handler address.
     * @param __batchHandler Address of the batchhandler currently deployed.
     */
    function setBatchHandler(address __batchHandler) external onlyRole(SETTER_ROLE) {
        batchHandler = __batchHandler;
    }

    /**
     * @dev function to parse input data.
     * @param data input data.
     */
    function parseInputs(
        bytes memory data
    ) public pure returns (uint256[] memory, uint96[] memory, address[] memory, uint256[] memory, bool) {
        return abi.decode(data, (uint256[], uint96[], address[], uint256[], bool));
    }

}
