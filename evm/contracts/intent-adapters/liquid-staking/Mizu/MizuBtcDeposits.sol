// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import {IBTCDepositsVault} from "./Interfaces.sol";
import {RouterIntentEoaAdapterWithoutDataProvider, EoaExecutorWithoutDataProvider} from "@routerprotocol/intents-core/contracts/RouterIntentEoaAdapter.sol";
import {Errors} from "@routerprotocol/intents-core/contracts/utils/Errors.sol";
import {IERC20, SafeERC20} from "../../../utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title BTCDataStore
 * @notice Manages the whitelist of supported BTC tokens
 */
contract BTCDataStore is Ownable {
    mapping(address => bool) public isBTCToken;

    event BTCTokenAdded(address indexed btcToken);
    event BTCTokenRemoved(address indexed btcToken);

    constructor(address _owner, address[] memory initialBTCTokens) {
        _transferOwnership(_owner);
        for (uint256 i = 0; i < initialBTCTokens.length; i++) {
            _validateAndAddBTCToken(initialBTCTokens[i]);
        }
    }

    /**
     * @notice Add new BTC token to supported list
     * @param _btcToken Address of the BTC token to add
     */
    function addBTCToken(address _btcToken) external onlyOwner {
        require(_btcToken != address(0), "Invalid btcToken address");
        require(!isBTCToken[_btcToken], "BTCToken already added");
        _validateAndAddBTCToken(_btcToken);
        emit BTCTokenAdded(_btcToken);
    }

    /**
     * @notice Remove existing BTC token from supported list
     * @param _btcToken Address of the BTC token to remove
     */
    function removeBTCToken(address _btcToken) external onlyOwner {
        require(isBTCToken[_btcToken], "BTCToken not found");
        isBTCToken[_btcToken] = false;
        emit BTCTokenRemoved(_btcToken);
    }

    /**
     * @notice Internal function to validate and add BTC token
     * @param _btcToken Address of the BTC token to validate and add
     */
    function _validateAndAddBTCToken(address _btcToken) internal {
        require(_btcToken != address(0), "Invalid btcToken address");
        isBTCToken[_btcToken] = true;
    }

    /**
     * @notice Check if a token is a supported BTC token
     * @param _token Address of the token to check
     * @return bool indicating if the token is a supported BTC token
     */
    function isBTCTokenSupported(address _token) external view returns (bool) {
        return isBTCToken[_token];
    }
}

/**
 * @title MizuBTCDeposits
 * @notice Staking BTC Tokens on Mizu to receive hyperBTC
 * @dev Includes dynamic btcToken management with ownership controls
 */
contract MizuBTCDeposits is RouterIntentEoaAdapterWithoutDataProvider {
    using SafeERC20 for IERC20;

    address public immutable hyperBTC;
    IBTCDepositsVault public immutable btcDepositsVault;
    BTCDataStore public immutable btcDataStore;

    constructor(
        address __native,
        address __wnative,
        address __hyperBTC,
        address __btcDepositsVault,
        address[] memory initialBTCTokens
    ) RouterIntentEoaAdapterWithoutDataProvider(__native, __wnative) {
        require(__hyperBTC != address(0), "Invalid hyperBTC address");
        require(__btcDepositsVault != address(0), "Invalid vault address");

        hyperBTC = __hyperBTC;
        btcDepositsVault = IBTCDepositsVault(__btcDepositsVault);
        btcDataStore = new BTCDataStore(msg.sender, initialBTCTokens);
    }

    /**
     * @notice Returns the name of the adapter
     */
    function name() public pure override returns (string memory) {
        return "MizuBTCDeposits";
    }

    /**
     * @notice Check if a token is a supported BTC token
     * @param _token Address of the token to check
     */
    function checkBTCToken(address _token) public view returns (bool) {
        return btcDataStore.isBTCToken(_token);
    }

    /**
     * @notice Execute the deposit of BTC tokens
     * @param data Encoded parameters for the deposit
     */
    function execute(
        bytes calldata data
    ) external payable override returns (address[] memory tokens) {
        (
            address _token,
            address _recipient,
            uint256 _amount,
            uint256 _minimumMint
        ) = parseInputs(data);
        require(_recipient != address(0), "Invalid recipient");
        require(btcDataStore.isBTCToken(_token), "Unsupported btcToken");

        // Handle token transfers based on execution context
        if (address(this) == self()) {
            IERC20(_token).safeTransferFrom(msg.sender, self(), _amount);
        } else if (_amount == type(uint256).max) {
            _amount = IERC20(_token).balanceOf(address(this));
        }
        bytes memory logData;

        (tokens, logData) = _processDeposit(
            _token,
            _recipient,
            _amount,
            _minimumMint
        );
        emit ExecutionEvent(name(), logData);
        return tokens;
    }

    /**
     * @notice Process the deposit of BTC tokens
     * @param _token Address of the BTC token to deposit
     * @param _recipient Address to receive the hyperBTC
     * @param _amount Amount of BTC token to deposit
     * @param _minimumMint Minimum amount of hyperBTC to mint
     */
    function _processDeposit(
        address _token,
        address _recipient,
        uint256 _amount,
        uint256 _minimumMint
    ) internal returns (address[] memory tokens, bytes memory logData) {
        uint256 _receivedLiquidBTC;
        IERC20(_token).safeIncreaseAllowance(address(hyperBTC), _amount);
        
        _receivedLiquidBTC = btcDepositsVault.deposit(
            _token,
            _amount,
            _minimumMint
        );
        tokens = new address[](2);
        tokens[0] = _token;
        tokens[1] = hyperBTC;
        IERC20(hyperBTC).safeTransfer(_recipient, _receivedLiquidBTC);
        logData = abi.encode(_recipient, _amount, _receivedLiquidBTC);
    }

    /**
     * @notice Parse the input data for the execute function
     * @param data Encoded parameters
     */
    function parseInputs(
        bytes memory data
    )
        public
        pure
        returns (
            address token,
            address recipient,
            uint256 amount,
            uint256 minimumMint
        )
    {
        return abi.decode(data, (address, address, uint256, uint256));
    }

    receive() external payable {}
}
