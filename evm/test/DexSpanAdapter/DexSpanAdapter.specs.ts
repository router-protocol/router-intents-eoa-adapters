import hardhat, { ethers, waffle } from "hardhat";
import { expect } from "chai";
import { RPC } from "../constants";
import { DEXSPAN, DEFAULT_ENV, NATIVE, WNATIVE } from "../../tasks/constants";
import { DexSpanAdapter__factory } from "../../typechain/factories/DexSpanAdapter__factory";
import { TokenInterface__factory } from "../../typechain/factories/TokenInterface__factory";
import { MockAssetForwarder__factory } from "../../typechain/factories/MockAssetForwarder__factory";
import { BatchTransaction__factory } from "../../typechain/factories/BatchTransaction__factory";
import { BigNumber, Contract, Wallet } from "ethers";
import { getPathfinderData } from "../utils";
import { defaultAbiCoder } from "ethers/lib/utils";
import { IWETH__factory } from "../../typechain/factories/IWETH__factory";
import { zeroAddress } from "ethereumjs-util";

const CHAIN_ID = "42161";
const NATIVE_TOKEN = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const USDT = "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9";

describe("DexSpan Adapter: ", async () => {
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
      WNATIVE[env][CHAIN_ID],
      mockAssetForwarder.address,
      DEXSPAN[env][CHAIN_ID],
      zeroAddress(),
      zeroAddress()
    );

    const DexSpanAdapter = await ethers.getContractFactory("DexSpanAdapter");
    const dexSpanAdapter = await DexSpanAdapter.deploy(
      NATIVE,
      WNATIVE[env][CHAIN_ID],
      DEXSPAN[env][CHAIN_ID]
    );

    await batchTransaction.setAdapterWhitelist(
      [dexSpanAdapter.address],
      [true]
    );

    return {
      batchTransaction: BatchTransaction__factory.connect(
        batchTransaction.address,
        deployer
      ),
      dexSpanAdapter: DexSpanAdapter__factory.connect(
        dexSpanAdapter.address,
        deployer
      ),
      mockAssetForwarder: MockAssetForwarder__factory.connect(
        mockAssetForwarder.address,
        deployer
      ),
      usdt: TokenInterface__factory.connect(USDT, deployer),
      wnative: IWETH__factory.connect(WNATIVE[env][CHAIN_ID], deployer),
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

  it("Can swap using dexspan on same chain", async () => {
    const { batchTransaction, dexSpanAdapter, usdt, wnative } =
      await setupTests();

    const amount = ethers.utils.parseEther("1").toString();
    await wnative.deposit({ value: amount });
    await wnative.approve(batchTransaction.address, amount);

    const { data: swapData } = await getPathfinderData(
      wnative.address,
      usdt.address,
      amount,
      CHAIN_ID,
      CHAIN_ID,
      deployer.address
    );

    const tokens = [wnative.address];
    const amounts = [amount];
    const targets = [dexSpanAdapter.address];
    const data = [swapData];
    const value = [0];
    const callType = [2];
    const feeInfo = [{ fee: 0, recipient: zeroAddress() }];

    const balBefore = await usdt.balanceOf(deployer.address);

    await batchTransaction.executeBatchCallsSameChain(
      0,
      tokens,
      amounts,
      "",
      targets,
      value,
      callType,
      data
    );

    const balAfter = await usdt.balanceOf(deployer.address);

    expect(balAfter).gt(balBefore);
  });

  it("Can swap using dexspan on dest chain when instruction is received from BatchTransaction contract", async () => {
    const {
      batchTransaction,
      dexSpanAdapter,
      usdt,
      mockAssetForwarder,
      wnative,
    } = await setupTests();

    const amount = ethers.utils.parseEther("1").toString();
    await wnative.deposit({ value: amount });
    await wnative.approve(mockAssetForwarder.address, amount);

    const { data: swapData } = await getPathfinderData(
      wnative.address,
      usdt.address,
      amount,
      CHAIN_ID,
      CHAIN_ID,
      deployer.address
    );

    const targets = [dexSpanAdapter.address];
    const data = [swapData];
    const value = [0];
    const callType = [2];

    const assetForwarderData = defaultAbiCoder.encode(
      ["uint256", "address", "address[]", "uint256[]", "uint256[]", "bytes[]"],
      [0, deployer.address, targets, value, callType, data]
    );

    const balBefore = await usdt.balanceOf(deployer.address);

    await mockAssetForwarder.handleMessage(
      wnative.address,
      amount,
      assetForwarderData,
      batchTransaction.address
    );

    const balAfter = await usdt.balanceOf(deployer.address);

    expect(balAfter).gt(balBefore);
  });
});
