// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import {IStablesDepositsVault} from "./Interfaces.sol";
import {RouterIntentEoaAdapterWithoutDataProvider, EoaExecutorWithoutDataProvider} from "@routerprotocol/intents-core/contracts/RouterIntentEoaAdapter.sol";
import {Errors} from "@routerprotocol/intents-core/contracts/utils/Errors.sol";
import {IERC20, SafeERC20} from "../../../utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title StablesDataStore
 * @notice Manages the whitelist of supported stablecoins
 */
contract StablesDataStore is Ownable {
    mapping(address => bool) public isStablecoin;

    event StablecoinAdded(address indexed stablecoin);
    event StablecoinRemoved(address indexed stablecoin);

    constructor(address _owner, address[] memory initialStablecoins) {
        _transferOwnership(_owner);
        for (uint256 i = 0; i < initialStablecoins.length; i++) {
            _validateAndAddStablecoin(initialStablecoins[i]);
        }
    }

    /**
     * @notice Add new stablecoin to supported list
     * @param _stablecoin Address of the stablecoin to add
     */
    function addStablecoin(address _stablecoin) external onlyOwner {
        require(_stablecoin != address(0), "Invalid stablecoin address");
        require(!isStablecoin[_stablecoin], "Stablecoin already added");
        _validateAndAddStablecoin(_stablecoin);
        emit StablecoinAdded(_stablecoin);
    }

    /**
     * @notice Remove existing stablecoin from supported list
     * @param _stablecoin Address of the stablecoin to remove
     */
    function removeStablecoin(address _stablecoin) external onlyOwner {
        require(isStablecoin[_stablecoin], "Stablecoin not found");
        isStablecoin[_stablecoin] = false;
        emit StablecoinRemoved(_stablecoin);
    }

    /**
     * @notice Internal function to validate and add stablecoin
     * @param _stablecoin Address of the stablecoin to validate and add
     */
    function _validateAndAddStablecoin(address _stablecoin) internal {
        require(_stablecoin != address(0), "Invalid stablecoin address");
        isStablecoin[_stablecoin] = true;
    }

    /**
     * @notice Check if a token is a supported stablecoin
     * @param _token Address of the token to check
     * @return bool indicating if the token is a supported stablecoin
     */
    function isStablecoinSupported(address _token) external view returns (bool) {
        return isStablecoin[_token];
    }
}

/**
 * @title MizuStablesDeposits
 * @notice Staking Stables Tokens on Mizu to receive hyperUSD
 * @dev Includes dynamic stablecoin management with ownership controls
 */
contract MizuStablesDeposits is RouterIntentEoaAdapterWithoutDataProvider {
    using SafeERC20 for IERC20;

    address public immutable hyperUSD;
    IStablesDepositsVault public immutable stablesDepositsVault;
    StablesDataStore public immutable stablesDataStore;

    constructor(
        address __native,
        address __wnative,
        address __hyperUSD,
        address __stablesDepositsVault,
        address[] memory initialStablecoins
    ) RouterIntentEoaAdapterWithoutDataProvider(__native, __wnative) {
        require(__hyperUSD != address(0), "Invalid hyperUSD address");
        require(__stablesDepositsVault != address(0), "Invalid vault address");
        
        hyperUSD = __hyperUSD;
        stablesDepositsVault = IStablesDepositsVault(__stablesDepositsVault);
        stablesDataStore = new StablesDataStore(
            msg.sender,
            initialStablecoins
        );
    }

    /**
     * @notice Returns the name of the adapter
     */
    function name() public pure override returns (string memory) {
        return "MizuStablesDeposits";
    }

    /**
     * @notice Check if a token is a supported stablecoin
     * @param _token Address of the token to check
     */
    function checkStable(address _token) public view returns(bool) {
        return stablesDataStore.isStablecoin(_token);
    }

    /**
     * @notice Execute the deposit of stablecoins
     * @param data Encoded parameters for the deposit
     */
    function execute(
        bytes calldata data
    ) external payable override returns (address[] memory tokens) {
        (address _token, address _recipient, uint256 _amount, uint256 _minimumMint) = parseInputs(data);
        require(_recipient != address(0), "Invalid recipient");
        require(stablesDataStore.isStablecoin(_token), "Unsupported stablecoin");
        
        // Handle token transfers based on execution context
        if (address(this) == self()) {
            IERC20(_token).safeTransferFrom(msg.sender, self(), _amount);
        } else if (_amount == type(uint256).max) {
            _amount = IERC20(_token).balanceOf(address(this));
        }

        bytes memory logData;
        
        (tokens, logData) = _processDeposit(_token, _recipient, _amount, _minimumMint);
        emit ExecutionEvent(name(), logData);
        return tokens;
    }

    /**
     * @notice Process the deposit of stablecoins
     * @param _token Address of the stablecoin to deposit
     * @param _recipient Address to receive the hyperUSD
     * @param _amount Amount of stablecoin to deposit
     * @param _minimumMint Minimum amount of hyperUSD to mint
     */
    function _processDeposit(
        address _token,
        address _recipient,
        uint256 _amount,
        uint256 _minimumMint
    ) internal returns (address[] memory tokens, bytes memory logData) {
        uint256 _receivedLiquidUSD;
        IERC20(_token).safeIncreaseAllowance(address(hyperUSD), _amount);
        
        _receivedLiquidUSD = stablesDepositsVault.deposit(_token, _amount, _minimumMint);

        tokens = new address[](2);
        tokens[0] = _token;
        tokens[1] = hyperUSD;
        
        IERC20(hyperUSD).safeTransfer(_recipient, _receivedLiquidUSD);
        logData = abi.encode(_recipient, _amount, _receivedLiquidUSD);
    }

    /**
     * @notice Parse the input data for the execute function
     * @param data Encoded parameters
     */
    function parseInputs(bytes memory data) public pure returns (
        address token,
        address recipient,
        uint256 amount,
        uint256 minimumMint
    ) {
        return abi.decode(data, (address, address, uint256, uint256));
    }

    receive() external payable {}
}