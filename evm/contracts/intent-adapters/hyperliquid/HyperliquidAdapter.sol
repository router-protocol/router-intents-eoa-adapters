// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import {IHyperliquidBridge} from "./Interfaces.sol";
import {RouterIntentEoaAdapterWithoutDataProvider, EoaExecutorWithoutDataProvider} from "@routerprotocol/intents-core/contracts/RouterIntentEoaAdapter.sol";
import {Errors} from "@routerprotocol/intents-core/contracts/utils/Errors.sol";
import {IERC20, SafeERC20} from "../../utils/SafeERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract HyperliquidAdapterDataStore is Ownable {
    address public assetForwarder;
    address public dexspan;
    address public assetBridge;

    constructor(
        address _owner,
        address _assetForwarder,
        address _dexspan,
        address _assetBridge
    ) {
        _transferOwnership(_owner);
        assetForwarder = _assetForwarder;
        dexspan = _dexspan;
        assetBridge = _assetBridge;
    }

    function setDexSpan(address _dexspan) external onlyOwner {
        dexspan = _dexspan;
    }

    function setAssetForwarder(address _assetForwarder) external onlyOwner {
        assetForwarder = _assetForwarder;
    }

    function setAssetBridge(address _assetBridge) external onlyOwner {
        assetBridge = _assetBridge;
    }
}

/**
 * @title HyperliquidAdapter
 * @author Yashika Goyal
 * @notice Depositing USDC to Hyperliquid Deposit Bridge.
 */
contract HyperliquidAdapter is RouterIntentEoaAdapterWithoutDataProvider {
    using SafeERC20 for IERC20;
    HyperliquidAdapterDataStore public immutable hlDataStore;

    address public immutable usdc;
    IHyperliquidBridge public immutable hyperliquidDepositBridge;

    event OperationSuccessful();

    constructor(
        address __native,
        address __wnative,
        address __assetForwarder,
        address __dexspan,
        address __assetBridge,
        address __usdc,
        address __hyperliquidDepositBridge
    ) RouterIntentEoaAdapterWithoutDataProvider(__native, __wnative) {
        hlDataStore = new HyperliquidAdapterDataStore(
            msg.sender,
            __assetForwarder,
            __dexspan,
            __assetBridge
        );
        usdc = __usdc;
        hyperliquidDepositBridge = IHyperliquidBridge(
            __hyperliquidDepositBridge
        );
    }

    function name() public pure override returns (string memory) {
        return "HyperliquidAdapter";
    }

    /**
     * @inheritdoc EoaExecutorWithoutDataProvider
     */
    function execute(
        bytes calldata data
    ) external payable override returns (address[] memory tokens) {
        (
            address user,
            uint64 usd,
            uint64 deadline,
            IHyperliquidBridge.Signature memory signature,
            address refundAddress
        ) = parseInputs(data);

        // If the adapter is called using `call` and not `delegatecall`
        if (address(this) == self()) {
            IERC20(usdc).safeTransferFrom(msg.sender, self(), usd);
        } else if (usd == type(uint64).max)
            usd = uint64(IERC20(usdc).balanceOf(address(this)));

        (tokens, ) = this.deposit(user, usd, deadline, signature);
    }

    function handleMessage(
        address tokenSent,
        uint256 amount,
        bytes memory instruction
    ) external onlyNitro nonReentrant {
        (
            address user,
            uint64 usd,
            uint64 deadline,
            IHyperliquidBridge.Signature memory signature,
            address refundAddress
        ) = parseInputs(instruction);

        require(refundAddress != address(0), "Invalid refund address");
        require(usd > 0 && uint64(amount) <= usd, "Invalid amount");

        try this.deposit(user, uint64(amount), deadline, signature) {
            emit OperationSuccessful();
        } catch {
            IERC20(tokenSent).safeTransfer(refundAddress, amount);
            emit OperationFailedRefundEvent(tokenSent, refundAddress, amount);
        }
    }

    //////////////////////////// ACTION LOGIC ////////////////////////////

    function deposit(
        address user,
        uint64 usd,
        uint64 deadline,
        IHyperliquidBridge.Signature memory signature
    ) external returns (address[] memory tokens, bytes memory logData) {
        require(
            msg.sender == address(this),
            "Can only call by this contract"
        );
        require(deadline > block.timestamp, "Expired deadline");
        IHyperliquidBridge.DepositWithPermit[]
            memory deposits = new IHyperliquidBridge.DepositWithPermit[](1);

        IERC20(usdc).safeTransfer(user, usd);

        deposits[0] = IHyperliquidBridge.DepositWithPermit({
            user: user,
            usd: usd,
            deadline: deadline,
            signature: signature
        });

        hyperliquidDepositBridge.batchedDepositWithPermit(deposits);

        tokens = new address[](1);
        tokens[0] = usdc;

        logData = abi.encode(user, usd);

        emit ExecutionEvent(name(), logData);
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
            address,
            uint64,
            uint64,
            IHyperliquidBridge.Signature memory,
            address
        )
    {
        return
            abi.decode(
                data,
                (address, uint64, uint64, IHyperliquidBridge.Signature, address)
            );
    }

    /**
     * @notice modifier to ensure that only Nitro bridge can call handleMessage function
     */
    modifier onlyNitro() {
        _onlyNitro();
        _;
    }

    function _onlyNitro() private view {
        address _assetForwarder = hlDataStore.assetForwarder();
        address _dexspan = hlDataStore.dexspan();
        address _assetBridge = hlDataStore.assetBridge();
        require(
            msg.sender == _assetForwarder ||
                msg.sender == _dexspan ||
                msg.sender == _assetBridge,
            Errors.ONLY_NITRO
        );
    }

    // solhint-disable-next-line no-empty-blocks
    receive() external payable {}
}
