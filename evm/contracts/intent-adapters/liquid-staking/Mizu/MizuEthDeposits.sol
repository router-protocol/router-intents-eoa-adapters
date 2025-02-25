// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import {IETHDepositsVault} from "./Interfaces.sol";
import {RouterIntentEoaAdapterWithoutDataProvider, EoaExecutorWithoutDataProvider} from "@routerprotocol/intents-core/contracts/RouterIntentEoaAdapter.sol";
import {Errors} from "@routerprotocol/intents-core/contracts/utils/Errors.sol";
import {IERC20, SafeERC20} from "../../../utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title ETHDataStore
 * @notice Manages the whitelist of supported ETH tokens
 */
contract ETHDataStore is Ownable {
    mapping(address => bool) public isETHToken;

    event ETHTokenAdded(address indexed ethToken);
    event ETHTokenRemoved(address indexed ethToken);

    constructor(address _owner, address[] memory initialETHTokens) {
        _transferOwnership(_owner);
        for (uint256 i = 0; i < initialETHTokens.length; i++) {
            _validateAndAddETHToken(initialETHTokens[i]);
        }
    }

    /**
     * @notice Add new ETH token to supported list
     * @param _ethToken Address of the ETH token to add
     */
    function addETHToken(address _ethToken) external onlyOwner {
        require(_ethToken != address(0), "Invalid ethToken address");
        require(!isETHToken[_ethToken], "ETHToken already added");
        _validateAndAddETHToken(_ethToken);
        emit ETHTokenAdded(_ethToken);
    }

    /**
     * @notice Remove existing ETH token from supported list
     * @param _ethToken Address of the ETH token to remove
     */
    function removeETHToken(address _ethToken) external onlyOwner {
        require(isETHToken[_ethToken], "ETHToken not found");
        isETHToken[_ethToken] = false;
        emit ETHTokenRemoved(_ethToken);
    }

    /**
     * @notice Internal function to validate and add ETH token
     * @param _ethToken Address of the ETH token to validate and add
     */
    function _validateAndAddETHToken(address _ethToken) internal {
        require(_ethToken != address(0), "Invalid ethToken address");
        isETHToken[_ethToken] = true;
    }

    /**
     * @notice Check if a token is a supported ETH token
     * @param _token Address of the token to check
     * @return bool indicating if the token is a supported ETH token
     */
    function isETHTokenSupported(address _token) external view returns (bool) {
        return isETHToken[_token];
    }
}

/**
 * @title MizuETHDeposits
 * @notice Staking ETH Tokens on Mizu to receive hyperETH
 * @dev Includes dynamic ethToken management with ownership controls
 */
contract MizuETHDeposits is RouterIntentEoaAdapterWithoutDataProvider {
    using SafeERC20 for IERC20;

    address public immutable hyperETH;
    IETHDepositsVault public immutable ethDepositsVault;
    ETHDataStore public immutable ethDataStore;

    constructor(
        address __native,
        address __wnative,
        address __hyperETH,
        address __ethDepositsVault,
        address[] memory initialETHTokens
    ) RouterIntentEoaAdapterWithoutDataProvider(__native, __wnative) {
        require(__hyperETH != address(0), "Invalid hyperETH address");
        require(__ethDepositsVault != address(0), "Invalid vault address");

        hyperETH = __hyperETH;
        ethDepositsVault = IETHDepositsVault(__ethDepositsVault);
        ethDataStore = new ETHDataStore(msg.sender, initialETHTokens);
    }

    /**
     * @notice Returns the name of the adapter
     */
    function name() public pure override returns (string memory) {
        return "MizuETHDeposits";
    }

    /**
     * @notice Check if a token is a supported ETH token
     * @param _token Address of the token to check
     */
    function checkETHToken(address _token) public view returns (bool) {
        return ethDataStore.isETHToken(_token);
    }

    /**
     * @notice Execute the deposit of ETH tokens
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
        require(ethDataStore.isETHToken(_token), "Unsupported ethToken");

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
     * @notice Process the deposit of ETH tokens
     * @param _token Address of the ETH token to deposit
     * @param _recipient Address to receive the hyperETH
     * @param _amount Amount of ETH token to deposit
     * @param _minimumMint Minimum amount of hyperETH to mint
     */
    function _processDeposit(
        address _token,
        address _recipient,
        uint256 _amount,
        uint256 _minimumMint
    ) internal returns (address[] memory tokens, bytes memory logData) {
        uint256 _receivedLiquidETH;
        IERC20(_token).safeIncreaseAllowance(address(hyperETH), _amount);

        _receivedLiquidETH = ethDepositsVault.deposit(
            _token,
            _amount,
            _minimumMint
        );

        tokens = new address[](2);
        tokens[0] = _token;
        tokens[1] = hyperETH;

        IERC20(hyperETH).safeTransfer(_recipient, _receivedLiquidETH);
        logData = abi.encode(_recipient, _amount, _receivedLiquidETH);
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
