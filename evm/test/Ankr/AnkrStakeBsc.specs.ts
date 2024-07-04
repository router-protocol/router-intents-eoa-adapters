import hardhat, { ethers, waffle } from "hardhat";
import { expect } from "chai";
import { RPC } from "../constants";
import { DEXSPAN, DEFAULT_ENV, NATIVE, WNATIVE } from "../../tasks/constants";
import { AnkrStakeBsc__factory } from "../../typechain/factories/AnkrStakeBsc__factory";
import { TokenInterface__factory } from "../../typechain/factories/TokenInterface__factory";
import { MockAssetForwarder__factory } from "../../typechain/factories/MockAssetForwarder__factory";
import { BatchTransaction__factory } from "../../typechain/factories/BatchTransaction__factory";
import { defaultAbiCoder } from "ethers/lib/utils";
import { DexSpanAdapter__factory } from "../../typechain/factories/DexSpanAdapter__factory";
import { zeroAddress } from "ethereumjs-util";
import { MaxUint256 } from "@ethersproject/constants";

const CHAIN_ID = "56";
const ANKR_TOKEN = "0x52F24a5e03aee338Da5fd9Df68D2b6FAe1178827";
const ANKR_POOL = "0x9e347Af362059bf2E55839002c699F7A5BaFE86E";
const NATIVE_TOKEN = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const USDT = "0x55d398326f99059ff775485246999027b3197955";

describe("AnkrStakeBsc Adapter: ", async () => {
  const [deployer, alice] = waffle.provider.getWallets();

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
      zeroAddress()
    );

    const DexSpanAdapter = await ethers.getContractFactory("DexSpanAdapter");
    const dexSpanAdapter = await DexSpanAdapter.deploy(
      NATIVE,
      WNATIVE[env][CHAIN_ID],
      DEXSPAN[env][CHAIN_ID]
    );

    const AnkrStakeBsc = await ethers.getContractFactory("AnkrStakeBsc");
    const ankrStakeBscAdapter = await AnkrStakeBsc.deploy(
      NATIVE,
      WNATIVE[env][CHAIN_ID],
      ANKR_TOKEN,
      ANKR_POOL
    );

    await batchTransaction.setAdapterWhitelist(
      [dexSpanAdapter.address, ankrStakeBscAdapter.address],
      [true, true]
    );

    return {
      batchTransaction: BatchTransaction__factory.connect(
        batchTransaction.address,
        deployer
      ),
      ankrStakeBscAdapter: AnkrStakeBsc__factory.connect(
        ankrStakeBscAdapter.address,
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
      ankrEth: TokenInterface__factory.connect(ANKR_TOKEN, deployer),
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

  it("Can stake on ankr on same chain", async () => {
    const { batchTransaction, ankrStakeBscAdapter, ankrEth } =
      await setupTests();

    const amount = ethers.utils.parseEther("1");

    const ankrData = defaultAbiCoder.encode(
      ["address", "uint256"],
      [deployer.address, MaxUint256]
    );

    const tokens = [NATIVE_TOKEN];
    const amounts = [amount];
    const feeInfo = [
      { fee: amount.mul(5).div(1000), recipient: alice.address },
    ];
    const targets = [ankrStakeBscAdapter.address];
    const data = [ankrData];
    const value = [0];
    const callType = [2];

    const balBefore = await ethers.provider.getBalance(deployer.address);
    const ankrEthBalBefore = await ankrEth.balanceOf(deployer.address);

    await batchTransaction.executeBatchCallsSameChain(
      0,
      tokens,
      amounts,
      feeInfo,
      targets,
      value,
      callType,
      data,
      { value: amount }
    );

    const balAfter = await ethers.provider.getBalance(deployer.address);
    const ankrEthBalAfter = await ankrEth.balanceOf(deployer.address);

    expect(balBefore).gt(balAfter);
    expect(ankrEthBalAfter).gt(ankrEthBalBefore);
  });

  it("Fee cannot be greater than 5%", async () => {
    const { batchTransaction, ankrStakeBscAdapter, ankrEth } =
      await setupTests();

    const amount = ethers.utils.parseEther("1");

    const ankrData = defaultAbiCoder.encode(
      ["address", "uint256"],
      [deployer.address, MaxUint256]
    );

    const tokens = [NATIVE_TOKEN];
    const amounts = [amount];
    const feeInfo = [{ fee: amount.mul(5).div(10), recipient: alice.address }];
    const targets = [ankrStakeBscAdapter.address];
    const data = [ankrData];
    const value = [0];
    const callType = [2];

    await expect(
      batchTransaction.executeBatchCallsSameChain(
        0,
        tokens,
        amounts,
        feeInfo,
        targets,
        value,
        callType,
        data,
        { value: amount }
      )
    ).to.be.revertedWith("17");
  });

  it("Fee recipient cannot be address 0 if fee is non-zero", async () => {
    const { batchTransaction, ankrStakeBscAdapter, ankrEth } =
      await setupTests();

    const amount = ethers.utils.parseEther("1");

    const ankrData = defaultAbiCoder.encode(
      ["address", "uint256"],
      [deployer.address, MaxUint256]
    );

    const tokens = [NATIVE_TOKEN];
    const amounts = [amount];
    const feeInfo = [
      { fee: amount.mul(5).div(1000), recipient: zeroAddress() },
    ];
    const targets = [ankrStakeBscAdapter.address];
    const data = [ankrData];
    const value = [0];
    const callType = [2];

    await expect(
      batchTransaction.executeBatchCallsSameChain(
        0,
        tokens,
        amounts,
        feeInfo,
        targets,
        value,
        callType,
        data,
        { value: amount }
      )
    ).to.be.revertedWith("18");
  });

  it("Can stake BSC on Ankr on dest chain when instruction is received from BatchTransaction contract", async () => {
    const {
      batchTransaction,
      ankrStakeBscAdapter,
      ankrEth,
      mockAssetForwarder,
    } = await setupTests();

    const amount = "100000000000000000";

    const targets = [ankrStakeBscAdapter.address];
    const data = [
      defaultAbiCoder.encode(
        ["address", "uint256"],
        [deployer.address, amount]
      ),
    ];
    const value = [0];
    const callType = [2];

    const assetForwarderData = defaultAbiCoder.encode(
      ["uint256", "address", "address[]", "uint256[]", "uint256[]", "bytes[]"],
      [0, deployer.address, targets, value, callType, data]
    );

    const balBefore = await ethers.provider.getBalance(deployer.address);
    const ankrEthBalBefore = await ankrEth.balanceOf(deployer.address);

    await mockAssetForwarder.handleMessage(
      NATIVE_TOKEN,
      amount,
      assetForwarderData,
      batchTransaction.address,
      { value: amount }
    );

    const balAfter = await ethers.provider.getBalance(deployer.address);
    const ankrEthBalAfter = await ankrEth.balanceOf(deployer.address);

    expect(balAfter).lt(balBefore);
    expect(ankrEthBalAfter).gt(ankrEthBalBefore);
  });
});
