import hardhat, { ethers, waffle } from "hardhat";
import { expect } from "chai";
import { RPC } from "../constants";
import { DEXSPAN, DEFAULT_ENV } from "../../tasks/constants";
import { BatchTransaction__factory } from "../../typechain/factories/BatchTransaction__factory";
import { FeeAdapter__factory } from "../../typechain/factories/FeeAdapter__factory";
import { defaultAbiCoder } from "ethers/lib/utils";
import { zeroAddress } from "ethereumjs-util";

// add new batch handler target > 1

const CHAIN_ID = "42161";
const FEE_WALLET = "0xbFF5f40b3d6e4351B37Acfe93eC9bA74B5573daE";
const BATCH_HANDLER_FEE = "5";
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

    const BatchTransaction = await ethers.getContractFactory(
      "BatchTransaction"
    );

    const batchTransaction = await BatchTransaction.deploy(
      NATIVE_TOKEN,
      WNATIVE_TOKEN,
      mockAssetForwarder.address,
      DEXSPAN[env][CHAIN_ID],
      zeroAddress()
    );

    const FeeAdapter = await ethers.getContractFactory("FeeAdapter");
    const feeAdapter = await FeeAdapter.deploy(
      NATIVE_TOKEN,
      WNATIVE_TOKEN,
      FEE_WALLET,
      BATCH_HANDLER_FEE,
      batchTransaction.address
    );

    await batchTransaction.setAdapterWhitelist([feeAdapter.address], [true]);
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

  it("Deduct fee in normal flow when batch handler fee is deducted", async () => {
    const { batchTransaction, feeAdapter } = await setupTests();

    const amount = ethers.utils.parseEther("1");

    const tokens = [NATIVE_TOKEN];
    const amounts = [amount];
    const appId = [1];
    const fee = [10000000];

    const feeData = defaultAbiCoder.encode(
      ["uint256[]", "uint96[]", "address[]", "uint256[]", "bool"],
      [appId, fee, tokens, amounts, true]
    );

    const targets = [feeAdapter.address];
    const data = [feeData];
    const value = [0];
    const callType = [2];
    // const feeInfo = [{ fee: 0, recipient: zeroAddress() }];

    const handlerBalancerBefore = await ethers.provider.getBalance(FEE_WALLET);
    const payBalancerBefore = await ethers.provider.getBalance(
      "0xBec33ce33afdAF5604CCDF2c4b575238C5FBD23d"
    );

    await batchTransaction.executeBatchCallsSameChain(
      0,
      tokens,
      amounts,
      targets,
      value,
      callType,
      data,
      { value: amount }
    );

    const handlerBalancerAfter = await ethers.provider.getBalance(FEE_WALLET);
    const payBalancerAfter = await ethers.provider.getBalance(
      "0xBec33ce33afdAF5604CCDF2c4b575238C5FBD23d"
    );
    expect(handlerBalancerAfter).gt(handlerBalancerBefore);
    expect(payBalancerAfter).gt(payBalancerBefore);
  });

  it("Deduct fee in normal flow when batch handler fee is not deducted", async () => {
    const { batchTransaction, feeAdapter } = await setupTests();

    const amount = ethers.utils.parseEther("1");

    const tokens = [NATIVE_TOKEN];
    const amounts = [amount];
    const appId = [1];
    const fee = [10000000];

    const feeData = defaultAbiCoder.encode(
      ["uint256[]", "uint96[]", "address[]", "uint256[]", "bool"],
      [appId, fee, tokens, amounts, false]
    );

    const targets = [feeAdapter.address];
    const data = [feeData];
    const value = [0];
    const callType = [2];
    // const feeInfo = [{ fee: 0, recipient: zeroAddress() }];

    const handlerBalancerBefore = await ethers.provider.getBalance(FEE_WALLET);
    const payBalancerBefore = await ethers.provider.getBalance(
      "0xBec33ce33afdAF5604CCDF2c4b575238C5FBD23d"
    );

    await batchTransaction.executeBatchCallsSameChain(
      0,
      tokens,
      amounts,
      targets,
      value,
      callType,
      data,
      { value: amount }
    );

    const handlerBalancerAfter = await ethers.provider.getBalance(FEE_WALLET);
    const payBalancerAfter = await ethers.provider.getBalance(
      "0xBec33ce33afdAF5604CCDF2c4b575238C5FBD23d"
    );
    expect(handlerBalancerAfter).equal(handlerBalancerBefore);
    expect(payBalancerAfter).gt(payBalancerBefore);
  });
});
