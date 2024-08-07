import hardhat, { ethers, waffle } from "hardhat";
import { expect } from "chai";
import { RPC } from "../constants";
import { DEXSPAN, DEFAULT_ENV } from "../../tasks/constants";
import { BatchTransaction__factory } from "../../typechain/factories/BatchTransaction__factory";
import { FeeAdapter__factory } from "../../typechain/factories/FeeAdapter__factory";
import { DexSpanAdapter__factory } from "../../typechain/factories/DexSpanAdapter__factory";
import { defaultAbiCoder } from "ethers/lib/utils";
import { zeroAddress } from "ethereumjs-util";
import { TokenInterface__factory } from "../../typechain/factories/TokenInterface__factory";
import { IWETH__factory } from "../../typechain/factories/IWETH__factory";
import { getPathfinderData } from "../utils";

const CHAIN_ID = "42161";
const FEE_WALLET = "0x00EB64b501613F8Cf8Ef3Ac4F82Fc63a50343fee";
const USDT = "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9";
const NATIVE_TOKEN = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const WNATIVE_TOKEN = "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1";

describe("Fee Adapter: ", async () => {
  const [deployer] = waffle.provider.getWallets();

  const setupTests = async () => {
    let env = process.env.ENV;
    if (!env) env = DEFAULT_ENV;
    const MockAssetForwarder = await ethers.getContractFactory(
      "MockAssetForwarder"
    );

    const mockAssetForwarder = await MockAssetForwarder.deploy();

    const FeeAdapter = await ethers.getContractFactory("FeeAdapter");
    const feeAdapter = await FeeAdapter.deploy(
      NATIVE_TOKEN,
      WNATIVE_TOKEN,
      FEE_WALLET,
      5
    );

    const BatchTransaction = await ethers.getContractFactory(
      "BatchTransaction"
    );

    const batchTransaction = await BatchTransaction.deploy(
      NATIVE_TOKEN,
      WNATIVE_TOKEN,
      mockAssetForwarder.address,
      DEXSPAN[env][CHAIN_ID],
      zeroAddress(),
      feeAdapter.address
    );

    const DexSpanAdapter = await ethers.getContractFactory("DexSpanAdapter");
    const dexSpanAdapter = await DexSpanAdapter.deploy(
      NATIVE_TOKEN,
      WNATIVE_TOKEN,
      DEXSPAN[env][CHAIN_ID]
    );

    await batchTransaction.setAdapterWhitelist(
      [feeAdapter.address, dexSpanAdapter.address],
      [true, true]
    );
    await feeAdapter.updateFeeWalletForAppId(
      1,
      "0xBec33ce33afdAF5604CCDF2c4b575238C5FBD23d"
    );
    return {
      batchTransaction: BatchTransaction__factory.connect(
        batchTransaction.address,
        deployer
      ),
      feeAdapter: FeeAdapter__factory.connect(feeAdapter.address, deployer),
      dexSpanAdapter: DexSpanAdapter__factory.connect(
        dexSpanAdapter.address,
        deployer
      ),
      usdt: TokenInterface__factory.connect(USDT, deployer),
      wnative: IWETH__factory.connect(WNATIVE_TOKEN, deployer),
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

  it("Deduct fee in normal flow when batch handler fee is deducted, swap from ETH to USDT", async () => {
    const { batchTransaction, dexSpanAdapter, wnative, usdt } =
      await setupTests();

    const amount = ethers.utils.parseEther("1").toString();
    await wnative.deposit({ value: amount });
    await wnative.approve(batchTransaction.address, amount);

    const tokens = [wnative.address];
    const amounts = [amount];
    const appId = [1];
    const fee = [100000000000];

    const feeData = defaultAbiCoder.encode(
      ["uint256[]", "uint96[]", "address[]", "uint256[]", "bool"],
      [appId, fee, tokens, amounts, true]
    );

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
    // const feeInfo = [{ fee: 0, recipient: zeroAddress() }];
    const balBefore = await usdt.balanceOf(deployer.address);

    const handlerBalancerBefore = await ethers.provider.getBalance(FEE_WALLET);
    const payBalancerBefore = await ethers.provider.getBalance(
      "0xBec33ce33afdAF5604CCDF2c4b575238C5FBD23d"
    );

    await batchTransaction.executeBatchCallsSameChain(
      0,
      tokens,
      amounts,
      feeData,
      targets,
      value,
      callType,
      data
    );

    const handlerBalancerAfter = await ethers.provider.getBalance(FEE_WALLET);
    const payBalancerAfter = await ethers.provider.getBalance(
      "0xBec33ce33afdAF5604CCDF2c4b575238C5FBD23d"
    );
    const balAfter = await usdt.balanceOf(deployer.address);
    expect(handlerBalancerAfter).gt(handlerBalancerBefore);
    expect(payBalancerAfter).gt(payBalancerBefore);
    expect(balAfter).gt(balBefore);
  });

  it("Deduct fee in normal flow when batch handler fee is not deducted", async () => {
    const { batchTransaction, dexSpanAdapter, wnative, usdt } =
      await setupTests();

    const amount = ethers.utils.parseEther("1").toString();
    await wnative.deposit({ value: amount });
    await wnative.approve(batchTransaction.address, amount);

    const tokens = [wnative.address];
    const amounts = [amount];
    const appId = [1];
    const fee = [100000000000];

    const feeData = defaultAbiCoder.encode(
      ["uint256[]", "uint96[]", "address[]", "uint256[]", "bool"],
      [appId, fee, tokens, amounts, false]
    );

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
    // const feeInfo = [{ fee: 0, recipient: zeroAddress() }];
    const balBefore = await usdt.balanceOf(deployer.address);

    const handlerBalancerBefore = await ethers.provider.getBalance(FEE_WALLET);
    const payBalancerBefore = await ethers.provider.getBalance(
      "0xBec33ce33afdAF5604CCDF2c4b575238C5FBD23d"
    );

    await batchTransaction.executeBatchCallsSameChain(
      0,
      tokens,
      amounts,
      feeData,
      targets,
      value,
      callType,
      data
    );

    const handlerBalancerAfter = await ethers.provider.getBalance(FEE_WALLET);
    const payBalancerAfter = await ethers.provider.getBalance(
      "0xBec33ce33afdAF5604CCDF2c4b575238C5FBD23d"
    );
    const balAfter = await usdt.balanceOf(deployer.address);
    expect(handlerBalancerAfter).eqls(handlerBalancerBefore);
    expect(payBalancerAfter).gt(payBalancerBefore);
    expect(balAfter).gt(balBefore);
  });

  it("Deduct No fee when inactive", async () => {
    const { batchTransaction, dexSpanAdapter, wnative, usdt } =
      await setupTests();

    const amount = ethers.utils.parseEther("1").toString();
    await wnative.deposit({ value: amount });
    await wnative.approve(batchTransaction.address, amount);

    const tokens = [wnative.address];
    const amounts = [amount];
    const appId = [""];
    const fee = [""];

    const feeData = defaultAbiCoder.encode(
      ["uint256[]", "uint96[]", "address[]", "uint256[]", "bool"],
      [appId, fee, tokens, amounts, false]
    );

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
    // const feeInfo = [{ fee: 0, recipient: zeroAddress() }];
    const balBefore = await usdt.balanceOf(deployer.address);

    const handlerBalancerBefore = await ethers.provider.getBalance(FEE_WALLET);
    const payBalancerBefore = await ethers.provider.getBalance(
      "0xBec33ce33afdAF5604CCDF2c4b575238C5FBD23d"
    );

    await batchTransaction.executeBatchCallsSameChain(
      0,
      tokens,
      amounts,
      feeData,
      targets,
      value,
      callType,
      data
    );

    const handlerBalancerAfter = await ethers.provider.getBalance(FEE_WALLET);
    const payBalancerAfter = await ethers.provider.getBalance(
      "0xBec33ce33afdAF5604CCDF2c4b575238C5FBD23d"
    );
    const balAfter = await usdt.balanceOf(deployer.address);
    expect(handlerBalancerAfter).eqls(handlerBalancerBefore);
    expect(payBalancerAfter).gt(payBalancerBefore);
    expect(balAfter).gt(balBefore);
  });
});
