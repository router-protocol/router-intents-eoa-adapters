import hardhat, { ethers, waffle } from "hardhat";
import { expect } from "chai";
import {
  DEXSPAN,
  DEFAULT_ENV,
  NATIVE,
  WNATIVE,
  FEE_WALLET,
} from "../../tasks/constants";
import { StaderStakeEth__factory } from "../../typechain/factories/StaderStakeEth__factory";
import { TokenInterface__factory } from "../../typechain/factories/TokenInterface__factory";
import { MockAssetForwarder__factory } from "../../typechain/factories/MockAssetForwarder__factory";
import { BatchTransaction__factory } from "../../typechain/factories/BatchTransaction__factory";
import { defaultAbiCoder } from "ethers/lib/utils";
import { DexSpanAdapter__factory } from "../../typechain/factories/DexSpanAdapter__factory";
import { zeroAddress } from "ethereumjs-util";
import { MaxUint256 } from "@ethersproject/constants";
import { getTransaction } from "../utils";

const CHAIN_ID = "1";
const BERA_STONE = "0x97Ad75064b20fb2B2447feD4fa953bF7F007a706";
const BERA_STONE_VAULT = "0x8f88aE3798E8fF3D0e0DE7465A0863C9bbB577f0";
const BERA_DEPOSIT_WRAPPER = "0x2aCA0C7ED4d5EB4a2116A3bc060A2F264a343357";
const NATIVE_TOKEN = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const USDT = "0xdAC17F958D2ee523a2206206994597C13D831ec7";
const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";

describe("BeraStakeStone Adapter: ", async () => {
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

    const StakeStoneBera = await ethers.getContractFactory("StakeStoneBera");
    const stakeStoneBeraAdapter = await StakeStoneBera.deploy(
      NATIVE,
      WNATIVE[env][CHAIN_ID],
      BERA_STONE,
      BERA_STONE_VAULT,
      BERA_DEPOSIT_WRAPPER
    );

    await batchTransaction.setAdapterWhitelist(
      [
        dexSpanAdapter.address,
        stakeStoneBeraAdapter.address,
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
      stakeStoneBeraAdapter: StaderStakeEth__factory.connect(
        stakeStoneBeraAdapter.address,
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
      usdc: TokenInterface__factory.connect(USDC, deployer),
      beraStone: TokenInterface__factory.connect(BERA_STONE, deployer),
    };
  };

  beforeEach(async function () {
    await hardhat.network.provider.request({
      method: "hardhat_reset",
      params: [
        {
          forking: {
            jsonRpcUrl: "https://eth.llamarpc.com",
          },
        },
      ],
    });
  });

  //   it("Can stake on StakeStone for BeraStone on same chain", async () => {
  //     const { batchTransaction, stakeStoneBeraAdapter, beraStone } =
  //       await setupTests();

  //     const amount = ethers.utils.parseEther("1");

  //     const BeraStoneData = defaultAbiCoder.encode(
  //       ["address", "address", "uint256"],
  //       [NATIVE, deployer.address, MaxUint256]
  //     );

  //     const tokens = [NATIVE_TOKEN];
  //     const amounts = [amount];
  //     const targets = [stakeStoneBeraAdapter.address];
  //     const data = [BeraStoneData];
  //     const value = [0];
  //     const callType = [2];
  //     // const feeInfo = [{ fee: 0, recipient: zeroAddress() }];

  //     const fee = ["0"];
  //     const feeData = defaultAbiCoder.encode(
  //       ["uint256[]", "uint96[]", "address[]", "uint256[]", "bool"],
  //       [["1"], fee, tokens, amounts, true]
  //     );

  //     const balBefore = await ethers.provider.getBalance(deployer.address);
  //     const beraStoneBalBefore = await beraStone.balanceOf(deployer.address);

  //     await batchTransaction.executeBatchCallsSameChain(
  //       0,
  //       tokens,
  //       amounts,
  //       feeData,
  //       targets,
  //       value,
  //       callType,
  //       data,
  //       { value: amount, gasLimit: 10000000 }
  //     );

  //     const balAfter = await ethers.provider.getBalance(deployer.address);
  //     const beraStoneBalAfter = await beraStone.balanceOf(deployer.address);

  //     expect(balBefore).gt(balAfter);
  //     expect(beraStoneBalAfter).gt(beraStoneBalBefore);
  //   });

  it("Can stake on StakeStone USDC for BeraStone on same chain", async () => {
    const { batchTransaction, stakeStoneBeraAdapter, beraStone, usdc } =
      await setupTests();

    const amount = ethers.utils.parseEther("0.2");

    const txn = await getTransaction({
      fromTokenAddress: NATIVE_TOKEN,
      toTokenAddress: USDC,
      amount: ethers.utils.parseEther("0.2").toString(),
      fromTokenChainId: CHAIN_ID,
      toTokenChainId: CHAIN_ID,
      senderAddress: deployer.address,
      receiverAddress: deployer.address,
    });

    await deployer.sendTransaction({
      to: txn.to,
      value: txn.value,
      data: txn.data,
    });
    expect(await usdc.balanceOf(deployer.address)).gt(0);

    const BeraStoneData = defaultAbiCoder.encode(
      ["address", "address", "uint256"],
      [NATIVE, deployer.address, MaxUint256]
    );

    const tokens = [USDC];
    const amounts = [ethers.constants.MaxUint256];
    const targets = [stakeStoneBeraAdapter.address];
    const data = [BeraStoneData];
    const value = [0];
    const callType = [2];
    // const feeInfo = [{ fee: 0, recipient: zeroAddress() }];

    const fee = ["0"];
    const feeData = defaultAbiCoder.encode(
      ["uint256[]", "uint96[]", "address[]", "uint256[]", "bool"],
      [["1"], fee, tokens, amounts, true]
    );

    const balBefore = await ethers.provider.getBalance(deployer.address);
    const beraStoneBalBefore = await beraStone.balanceOf(deployer.address);

    await usdc.approve(batchTransaction.address, ethers.constants.MaxUint256);

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
    const beraStoneBalAfter = await beraStone.balanceOf(deployer.address);

    expect(balBefore).gt(balAfter);
    expect(beraStoneBalAfter).gt(beraStoneBalBefore);
  });

  //   it("Can stake ETH on Stader on dest chain when instruction is received from BatchTransaction contract", async () => {
  //     const {
  //       batchTransaction,
  //       stakeStoneBeraAdapter,
  //       beraStone,
  //       mockAssetForwarder,
  //     } = await setupTests();

  //     const amount = "100000000000000000";

  //     const targets = [stakeStoneBeraAdapter.address];
  //     const data = [
  //       defaultAbiCoder.encode(
  //         ["address", "uint256"],
  //         [deployer.address, amount]
  //       ),
  //     ];
  //     const value = [0];
  //     const callType = [2];

  //     const assetForwarderData = defaultAbiCoder.encode(
  //       ["uint256", "address", "address[]", "uint256[]", "uint256[]", "bytes[]"],
  //       [0, deployer.address, targets, value, callType, data]
  //     );

  //     const balBefore = await ethers.provider.getBalance(deployer.address);
  //     const beraStoneBalBefore = await beraStone.balanceOf(deployer.address);

  //     await mockAssetForwarder.handleMessage(
  //       NATIVE_TOKEN,
  //       amount,
  //       assetForwarderData,
  //       batchTransaction.address,
  //       { value: amount }
  //     );

  //     const balAfter = await ethers.provider.getBalance(deployer.address);
  //     const beraStoneBalAfter = await beraStone.balanceOf(deployer.address);

  //     expect(balAfter).lt(balBefore);
  //     expect(beraStoneBalAfter).gt(beraStoneBalBefore);
  //   });
});
