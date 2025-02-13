import hardhat, { ethers, waffle } from "hardhat";
import { expect } from "chai";
import {
  DEXSPAN,
  DEFAULT_ENV,
  NATIVE,
  WNATIVE,
  FEE_WALLET,
} from "../../tasks/constants";
import { VirtualsDeposits__factory } from "../../typechain/factories/VirtualsDeposits__factory";
import { TokenInterface__factory } from "../../typechain/factories/TokenInterface__factory";
import { MockAssetForwarder__factory } from "../../typechain/factories/MockAssetForwarder__factory";
import { BatchTransaction__factory } from "../../typechain/factories/BatchTransaction__factory";
import { defaultAbiCoder } from "ethers/lib/utils";
import { DexSpanAdapter__factory } from "../../typechain/factories/DexSpanAdapter__factory";
import { zeroAddress } from "ethereumjs-util";
// import { MaxUint256 } from "@ethersproject/constants";
import { getTransaction } from "../utils";
// import { RPC } from "../constants";

const CHAIN_ID = "8453";
const VIRTUALS_TOKEN = "0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b";
const VIRTUALS_FACTORY = "0xF66DeA7b3e897cD44A5a231c61B6B4423d613259";
const NATIVE_TOKEN = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const VITA_NOVA_TOKEN = "0xa1Aa9888Ec058CAf2C9813c93493ab6b3bbB3F50";

describe("VirtualsDeposits Adapter: ", async () => {
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

    const VirtualsDeposits = await ethers.getContractFactory(
      "VirtualsDeposits"
    );
    const virtualsDeposits = await VirtualsDeposits.deploy(
      NATIVE,
      WNATIVE[env][CHAIN_ID],
      VIRTUALS_TOKEN,
      VIRTUALS_FACTORY
    );

    await batchTransaction.setAdapterWhitelist(
      [dexSpanAdapter.address, virtualsDeposits.address, feeAdapter.address],
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
      virtualsDeposits: VirtualsDeposits__factory.connect(
        virtualsDeposits.address,
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
      vitaNova: TokenInterface__factory.connect(VITA_NOVA_TOKEN, deployer),
      virtualToken: TokenInterface__factory.connect(VIRTUALS_TOKEN, deployer),
    };
  };

  beforeEach(async function () {
    await hardhat.network.provider.request({
      method: "hardhat_reset",
      params: [
        {
          forking: {
            jsonRpcUrl: "https://base.llamarpc.com",
          },
        },
      ],
    });
  });

  it("Can deposits on virtuals protocol for vitaNova on same chain", async () => {
    const { batchTransaction, virtualsDeposits, vitaNova, virtualToken } =
      await setupTests();

    // const amount = ethers.utils.parseEther("0.2");

    const txn = await getTransaction({
      fromTokenAddress: NATIVE_TOKEN,
      toTokenAddress: VIRTUALS_TOKEN,
      amount: ethers.utils.parseEther("100").toString(),
      fromTokenChainId: CHAIN_ID,
      toTokenChainId: CHAIN_ID,
      senderAddress: deployer.address,
      receiverAddress: deployer.address,
    });

    // console.log("txn", txn);

    await deployer.sendTransaction({
      to: txn.to,
      value: txn.value,
      data: txn.data,
    });

    const virtualTokenBalBefore = await virtualToken.balanceOf(
      deployer.address
    );

    expect(virtualTokenBalBefore).gt(0);

    const unit256Max = ethers.BigNumber.from(
      "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"
    );

    const VirtualsDepositsData = defaultAbiCoder.encode(
      ["address", "address", "address", "uint256"],
      [virtualToken.address, vitaNova.address, deployer.address, unit256Max]
    );

    const tokens = [VIRTUALS_TOKEN];
    const amounts = [virtualTokenBalBefore];
    const targets = [virtualsDeposits.address];
    const data = [VirtualsDepositsData];
    const value = [0];
    const callType = [2];
    // const feeInfo = [{ fee: 0, recipient: zeroAddress() }];

    const fee = ["0"];
    const feeData = defaultAbiCoder.encode(
      ["uint256[]", "uint96[]", "address[]", "uint256[]", "bool"],
      [["1"], fee, tokens, amounts, true]
    );

    const balBefore = await ethers.provider.getBalance(deployer.address);
    const vitaNovaBalBefore = await vitaNova.balanceOf(deployer.address);

    await virtualToken.approve(
      batchTransaction.address,
      ethers.constants.MaxUint256
    );

    await batchTransaction.executeBatchCallsSameChain(
      0,
      tokens,
      amounts,
      feeData,
      targets,
      value,
      callType,
      data,
      { gasLimit: 10000000 }
    );

    const balAfter = await ethers.provider.getBalance(deployer.address);
    const vitaNovaBalAfter = await vitaNova.balanceOf(deployer.address);

    expect(balBefore).gt(balAfter);
    expect(vitaNovaBalAfter).gt(vitaNovaBalBefore);
  });
});
