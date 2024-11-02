import hardhat, { ethers, waffle } from "hardhat";
import { expect } from "chai";
import { RPC } from "../constants";
import {
  DEXSPAN,
  DEFAULT_ENV,
  NATIVE,
  WNATIVE,
  FEE_WALLET,
} from "../../tasks/constants";
import { TokenLaunch__factory } from "../../typechain/factories/TokenLaunch__factory";
import { TokenInterface__factory } from "../../typechain/factories/TokenInterface__factory";
import { MockAssetForwarder__factory } from "../../typechain/factories/MockAssetForwarder__factory";
import { BatchTransaction__factory } from "../../typechain/factories/BatchTransaction__factory";
import { defaultAbiCoder } from "ethers/lib/utils";
import { DexSpanAdapter__factory } from "../../typechain/factories/DexSpanAdapter__factory";
import { zeroAddress } from "ethereumjs-util";
import { FeeAdapter__factory } from "../../typechain/factories/FeeAdapter__factory";

const CHAIN_ID = "8453";
const PRE_MINTING_CONTRACT = "0x513CEc9d8e71262AAEBF4d5393e9D80bf961B008";
const NATIVE_TOKEN = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const USDT = "0xdac17f958d2ee523a2206206994597c13d831ec7";

describe("Token Pre Launch Adapter: ", async () => {
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

    const FeeAdapter = await ethers.getContractFactory("FeeAdapter");
    const feeAdapter = await FeeAdapter.deploy(
      NATIVE_TOKEN,
      WNATIVE[env][CHAIN_ID],
      FEE_WALLET,
      5
    );

    const batchTransaction = await BatchTransaction.deploy(
      NATIVE,
      WNATIVE[env][CHAIN_ID],
      mockAssetForwarder.address,
      DEXSPAN[env][CHAIN_ID],
      zeroAddress(),
      feeAdapter.address
    );

    const DexSpanAdapter = await ethers.getContractFactory("DexSpanAdapter");
    const dexSpanAdapter = await DexSpanAdapter.deploy(
      NATIVE,
      WNATIVE[env][CHAIN_ID],
      DEXSPAN[env][CHAIN_ID]
    );

    const TokenLaunch = await ethers.getContractFactory("TokenLaunch");
    const tokenPrelaunchAdapter = await TokenLaunch.deploy(
      NATIVE,
      WNATIVE[env][CHAIN_ID],
      PRE_MINTING_CONTRACT
    );

    await batchTransaction.setAdapterWhitelist(
      [
        dexSpanAdapter.address,
        tokenPrelaunchAdapter.address,
        feeAdapter.address,
      ],
      [true, true, true]
    );

    const FeeDataStoreAddress = await feeAdapter.feeDataStore();

    const FeeDataStoreContract = await ethers.getContractFactory(
      "FeeDataStore"
    );
    const feeDataStoreInstance =
      FeeDataStoreContract.attach(FeeDataStoreAddress);

    await feeDataStoreInstance.updateFeeWalletForAppId(
      [1],
      ["0xBec33ce33afdAF5604CCDF2c4b575238C5FBD23d"]
    );

    return {
      batchTransaction: BatchTransaction__factory.connect(
        batchTransaction.address,
        deployer
      ),
      feeAdapter: FeeAdapter__factory.connect(feeAdapter.address, deployer),
      tokenPrelaunchAdapter: TokenLaunch__factory.connect(
        tokenPrelaunchAdapter.address,
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

  it("Can stake on eth on same chain", async () => {
    const { batchTransaction, tokenPrelaunchAdapter } = await setupTests();

    const amount = ethers.utils.parseEther("1");

    const refereerAddress = "0x00eb64b501613f8cf8ef3ac4f82fc63a50343fee";
    const refundAddress = "0xBec33ce33afdAF5604CCDF2c4b575238C5FBD23d";
    const tokenData = defaultAbiCoder.encode(
      ["address", "uint256", "address", "address"],
      [NATIVE_TOKEN, amount, refereerAddress, refundAddress]
    );

    const tokens = [NATIVE_TOKEN];
    const amounts = [amount];
    const targets = [tokenPrelaunchAdapter.address];
    const data = [tokenData];
    const value = [0];
    const callType = [2];
    // const feeInfo = [{ fee: 0, recipient: zeroAddress() }];

    const fee = ["0"];
    const feeData = defaultAbiCoder.encode(
      ["uint256[]", "uint96[]", "address[]", "uint256[]", "bool"],
      [["1"], fee, tokens, amounts, true]
    );

    const balBefore = await ethers.provider.getBalance(deployer.address);
    await batchTransaction.executeBatchCallsSameChain(
      0,
      tokens,
      amounts,
      feeData,
      targets,
      value,
      callType,
      data,
      { value: amount, gasLimit: 10000000 }
    );

    const balAfter = await ethers.provider.getBalance(deployer.address);
    expect(balBefore).gt(balAfter);
  });

  // it("Can stake ETH on Swell on dest chain when instruction is received from BatchTransaction contract", async () => {
  //   const {
  //     batchTransaction,
  //     swellStakeEthAdapter,
  //     swEth,
  //     mockAssetForwarder,
  //   } = await setupTests();

  //   const amount = "100000000000000000";

  //   const targets = [swellStakeEthAdapter.address];
  //   const data = [
  //     defaultAbiCoder.encode(
  //       ["address", "uint256"],
  //       [deployer.address, amount]
  //     ),
  //   ];
  //   const value = [0];
  //   const callType = [2];

  //   const assetForwarderData = defaultAbiCoder.encode(
  //     ["uint256", "address", "address[]", "uint256[]", "uint256[]", "bytes[]"],
  //     [0, deployer.address, targets, value, callType, data]
  //   );
  //   const balBefore = await ethers.provider.getBalance(deployer.address);
  //   const swEthBalBefore = await swEth.balanceOf(deployer.address);

  //   await mockAssetForwarder.handleMessage(
  //     NATIVE_TOKEN,
  //     amount,
  //     assetForwarderData,
  //     batchTransaction.address,
  //     { value: amount }
  //   );

  //   const balAfter = await ethers.provider.getBalance(deployer.address);
  //   const swEthBalAfter = await swEth.balanceOf(deployer.address);

  //   expect(balAfter).lt(balBefore);
  //   expect(swEthBalAfter).gt(swEthBalBefore);
  // });
});
