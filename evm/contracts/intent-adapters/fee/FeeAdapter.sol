// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import {RouterIntentEoaAdapterWithoutDataProvider, EoaExecutorWithoutDataProvider} from "@routerprotocol/intents-core/contracts/RouterIntentEoaAdapter.sol";
import {Errors} from "../../Errors.sol";
import {IERC20, SafeERC20} from "../../utils/SafeERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract FeeDataStore is Ownable {
    uint256 public batchHandlerFeeInBps;
    mapping(uint256 => address) public feeWalletWhitelist;
    address public _feeWallet;

    uint256 public MAX_BEPS;

    constructor(
        address _owner,
        uint16 __batchHandlerFee,
        address __feeWallet
    ) {
        _transferOwnership(_owner);
        batchHandlerFeeInBps = __batchHandlerFee;
        _feeWallet = __feeWallet;
        MAX_BEPS = 500;
    }

    /**
     * @notice function to update fee wallet for partner.
     * @param appIds Array of appIds for partner.
     * @param feeWallets Array of Addresses of the partner fee wallet.
     */
    function updateFeeWalletForAppId(
        uint256[] memory appIds,
        address[] memory feeWallets
    ) external onlyOwner {
        uint256 len = feeWallets.length;

        require(len != 0 && len == appIds.length, Errors.ARRAY_LENGTH_MISMATCH);

        for (uint i = 0; i < len; ) {
            feeWalletWhitelist[appIds[i]] = feeWallets[i];
            unchecked {
                ++i;
            }
        }
    }

    /**
     * @notice function to check whether an adapter is whitelisted.
     * @param appId appId of partner.
     */
    function isAppIdFeeWalletWhitelisted(
        uint256 appId,
        address feeWallet
    ) public view returns (bool) {
        return feeWalletWhitelist[appId] == feeWallet;
    }

    /**
     * @notice function to set batch handler fee in bps.
     * @param _batchHandlerFeeInBps Fee to be charged in bps
     */
    function setBatchHandlerFeeInBps(
        uint256 _batchHandlerFeeInBps
    ) external onlyOwner {
        batchHandlerFeeInBps = _batchHandlerFeeInBps;
    }

    /**
     * @notice function to set Fee wallet.
     * @param feeWallet Fee address to update
     */
    function setFeeWallet(address feeWallet) external onlyOwner{
        _feeWallet = feeWallet;
    }
    /**
     * @notice function to set Fee wallet.
     * @param _max_beps Fee address to update
     */
    function setMaxBeps(uint256 _max_beps) external onlyOwner{
        MAX_BEPS = _max_beps;
    }
}

/**
 * @title FeeAdapter
 * @author Ateet Tiwari
 * @notice Adapter for Fee Deductions
 */
contract FeeAdapter is
    RouterIntentEoaAdapterWithoutDataProvider,
    AccessControl
{
    using SafeERC20 for IERC20;

    FeeDataStore public immutable feeDataStore;

    constructor(
        address __native,
        address __wnative,
        address __feeWallet,
        uint16 __batchHandlerFee
    )
        RouterIntentEoaAdapterWithoutDataProvider(__native, __wnative)
    // solhint-disable-next-line no-empty-blocks
    {
        feeDataStore = new FeeDataStore(
            msg.sender,
            __batchHandlerFee,
            __feeWallet
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
    ) external payable override returns (address[] memory tokens) {
        (
            uint256[] memory _appId,
            uint96[] memory _fee,
            address[] memory _tokens,
            uint256[] memory _amounts,
            bool _isActive
        ) = parseInputs(data);

        uint256 appIdLength = _appId.length;
        uint256 tokenLength = _tokens.length;      
        require(appIdLength == _fee.length, Errors.ARRAY_LENGTH_MISMATCH);
        require(tokenLength == _amounts.length, Errors.ARRAY_LENGTH_MISMATCH);

        for (uint256 x = 0; x < tokenLength; ) {
            if (_isActive) {
                uint256 fee = (_amounts[x] *
                    feeDataStore.batchHandlerFeeInBps()) / 10000;
                if (fee > (_amounts[x] * feeDataStore.MAX_BEPS()) / 10000) {
                    revert(Errors.FEE_EXCEEDS_MAX_BIPS);
                }
                withdrawTokens(_tokens[x], feeDataStore._feeWallet(), uint256(fee));
            }

            for (uint256 i = 0; i < appIdLength; ) {
                uint256 appId = _appId[i];
                if(appId == 0)
                {
                    unchecked {
                        ++i;
                    }   
                    continue;
                }
                else {
                    address feeWalletForApp = feeDataStore.feeWalletWhitelist(
                    appId);
                

                    if (feeWalletForApp != address(0)) {
                        if (_fee[i] > (_amounts[x] * feeDataStore.MAX_BEPS()) / 10000) {
                            revert(Errors.FEE_EXCEEDS_MAX_BIPS);
                        }
                        withdrawTokens(
                            _tokens[x],
                            feeWalletForApp,
                            uint256(_fee[i])
                        );
                    } else {
                        revert("Fee Params not present for appId");
                    }
                    unchecked {
                        ++i;
                    }   
                }
            }

            unchecked {
                ++x;
            }
        }

        return _tokens;
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
        returns (
            uint256[] memory,
            uint96[] memory,
            address[] memory,
            uint256[] memory,
            bool
        )
    {
        return
            abi.decode(data, (uint256[], uint96[], address[], uint256[], bool));
    }
}