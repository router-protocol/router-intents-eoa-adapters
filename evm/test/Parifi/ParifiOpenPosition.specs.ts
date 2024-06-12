import hardhat, { ethers, waffle } from "hardhat";
import { expect } from "chai";
import { RPC } from "../constants";
import { DEFAULT_ENV, DEXSPAN, NATIVE } from "../../tasks/constants";
import { ParifiOpenPositionAdapter__factory } from "../../typechain/factories/ParifiOpenPositionAdapter__factory";
import { MockAssetForwarder__factory } from "../../typechain/factories/MockAssetForwarder__factory";
import { BatchTransaction__factory } from "../../typechain/factories/BatchTransaction__factory";
import {
  PARIFI_DATA_FABRIC,
  PARIFI_ORDER_MANAGER,
} from "../../tasks/deploy/parifi/constants";
import { IWETH__factory } from "../../typechain/factories/IWETH__factory";
import { IParifiOrderManager__factory } from "../../typechain/factories/IParifiOrderManager__factory";
import { TokenInterface__factory } from "../../typechain/factories/TokenInterface__factory";
import { getTransaction } from "../utils";

const CHAIN_ID = "42161";
const WETH_MARKET_ID =
  "0x2ece90b31f9784e9c150afb8761583f3b1324c1bac55cc4053e27e97e1392b09";
const WETH = "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1";

const USDC = "0xaf88d065e77c8cc2239327c5edb3a432268e5831";
const USDC_MARKET_ID =
  "0x89bcc03c0c1cd8b7b672186d1473047b4ed88411558c3a6b653b97104e239c50";

describe("Parifi Open Position Adapter: ", async () => {
  const [deployer] = waffle.provider.getWallets();

  const setupTests = async () => {
    let env = process.env.ENV;
    if (!env) env = DEFAULT_ENV;

    const MockAssetForwarder = await ethers.getContractFactory(
      "MockAssetForwarder"
    );
    const mockAssetForwarder = await MockAssetForwarder.deploy();

    const BatchTransaction = await ethers.getContractFactory(
      "BatchTransaction"
    );

    const batchTransaction = await BatchTransaction.deploy(
      NATIVE,
      WETH,
      mockAssetForwarder.address,
      DEXSPAN[env][CHAIN_ID]
    );

    const ParifiOpenPosition = await ethers.getContractFactory(
      "ParifiOpenPosition"
    );
    const parifiOpenPositionAdapter = await ParifiOpenPosition.deploy(
      NATIVE,
      WETH,
      PARIFI_ORDER_MANAGER[CHAIN_ID],
      PARIFI_DATA_FABRIC[CHAIN_ID]
    );

    await batchTransaction.setAdapterWhitelist(
      [parifiOpenPositionAdapter.address],
      [true]
    );

    return {
      batchTransaction: BatchTransaction__factory.connect(
        batchTransaction.address,
        deployer
      ),
      parifiOpenPositionAdapter: ParifiOpenPositionAdapter__factory.connect(
        parifiOpenPositionAdapter.address,
        deployer
      ),
      mockAssetForwarder: MockAssetForwarder__factory.connect(
        mockAssetForwarder.address,
        deployer
      ),
      weth: IWETH__factory.connect(WETH, deployer),
      usdc: TokenInterface__factory.connect(USDC, deployer),
    };
  };

  beforeEach(async function () {
    await hardhat.network.provider.request({
      method: "hardhat_reset",
      params: [
        {
          forking: {
            jsonRpcUrl: RPC[CHAIN_ID],
          },
        },
      ],
    });
  });

  it("Can open position on Parifi", async () => {
    const { batchTransaction, parifiOpenPositionAdapter, usdc } =
      await setupTests();

    const amount = ethers.utils.parseEther("1");

    const tx = await getTransaction({
      fromTokenAddress: NATIVE,
      toTokenAddress: USDC,
      amount: amount,
      fromTokenChainId: CHAIN_ID,
      toTokenChainId: CHAIN_ID,
      senderAddress: deployer.address,
      recipientAddress: deployer.address,
    });

    await deployer.sendTransaction({
      ...tx,
      gasLimit: 10000000,
      gasPrice: 10000000000,
    });
    const usdcBal = await usdc.balanceOf(deployer.address);
    expect(usdcBal).gt(0);

    const orderTuple =
      "tuple(bytes32 marketId, address userAddress, uint8 orderType, bool isLong, bool isLimitOrder, bool triggerAbove, uint256 deadline, uint256 deltaCollateral, uint256 deltaSize, uint256 expectedPrice, uint256 maxSlippage, address partnerAddress) Order";

    const usdcAmt = "4000000";
    const order = {
      marketId: USDC_MARKET_ID,
      userAddress: deployer.address,
      orderType: 0, // OPEN_NEW_POSITION
      isLong: true,
      isLimitOrder: false,
      triggerAbove: false,
      deadline: "0",
      deltaCollateral: usdcAmt,
      deltaSize: "1000000000000000",
      expectedPrice: 0,
      maxSlippage: "200",
      partnerAddress: ethers.constants.AddressZero,
    };

    const parifiData = ethers.utils.defaultAbiCoder.encode(
      [orderTuple],
      [order]
    );

    await usdc.approve(batchTransaction.address, usdcAmt);

    const tokens = [USDC];
    const amounts = [usdcAmt];
    const targets = [parifiOpenPositionAdapter.address];
    const data = [parifiData];
    const value = [0];
    const callType = [2];

    const orderManager = IParifiOrderManager__factory.connect(
      PARIFI_ORDER_MANAGER[CHAIN_ID],
      deployer
    );

    // Next orderId for user
    const orderId = await orderManager.getOrderIdForUser(deployer.address);

    await batchTransaction.executeBatchCallsSameChain(
      0,
      tokens,
      amounts,
      targets,
      value,
      callType,
      data
    );

    const orderDetails = await orderManager.getPendingOrder(orderId);
    expect(orderDetails[0]).eq(USDC_MARKET_ID);
  });
});
