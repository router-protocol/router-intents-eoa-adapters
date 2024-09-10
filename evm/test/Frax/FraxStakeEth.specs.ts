import hardhat, { ethers, waffle } from "hardhat";
import { expect } from "chai";
import { RPC } from "../constants";
import { DEXSPAN, DEFAULT_ENV, NATIVE, WNATIVE } from "../../tasks/constants";
import { FraxStakeEth__factory } from "../../typechain/factories/FraxStakeEth__factory";
import { TokenInterface__factory } from "../../typechain/factories/TokenInterface__factory";
import { MockAssetForwarder__factory } from "../../typechain/factories/MockAssetForwarder__factory";
import { BatchTransaction__factory } from "../../typechain/factories/BatchTransaction__factory";
import { defaultAbiCoder } from "ethers/lib/utils";
import { DexSpanAdapter__factory } from "../../typechain/factories/DexSpanAdapter__factory";
import { zeroAddress } from "ethereumjs-util";

const CHAIN_ID = "1";
const FRAX_ETH_TOKEN = "0x5E8422345238F34275888049021821E8E08CAa1f";
const S_FRAX_ETH_TOKEN = "0xac3E018457B222d93114458476f3E3416Abbe38F";
const FRAX_POOL = "0xbAFA44EFE7901E04E39Dad13167D089C559c1138";
const NATIVE_TOKEN = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const USDT = "0xdac17f958d2ee523a2206206994597c13d831ec7";

describe("FraxStakeEth Adapter: ", async () => {
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

    const FraxStakeEth = await ethers.getContractFactory("FraxStakeEth");
    const fraxStakeEthAdapter = await FraxStakeEth.deploy(
      NATIVE,
      WNATIVE[env][CHAIN_ID],
      FRAX_ETH_TOKEN,
      S_FRAX_ETH_TOKEN,
      FRAX_POOL
    );

    await batchTransaction.setAdapterWhitelist(
      [dexSpanAdapter.address, fraxStakeEthAdapter.address],
      [true, true]
    );

    return {
      batchTransaction: BatchTransaction__factory.connect(
        batchTransaction.address,
        deployer
      ),
      fraxStakeEthAdapter: FraxStakeEth__factory.connect(
        fraxStakeEthAdapter.address,
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
      fraxEth: TokenInterface__factory.connect(FRAX_ETH_TOKEN, deployer),
      sFraxEth: TokenInterface__factory.connect(S_FRAX_ETH_TOKEN, deployer),
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

  it("FRAX_ETH: Can stake on frax on same chain", async () => {
    const { batchTransaction, fraxStakeEthAdapter, fraxEth } =
      await setupTests();

    const amount = ethers.utils.parseEther("1");
    const txType = "1";

    const fraxData = defaultAbiCoder.encode(
      ["address", "uint256", "uint256"],
      [deployer.address, amount, txType]
    );

    const tokens = [NATIVE_TOKEN];
    const amounts = [amount];
    const targets = [fraxStakeEthAdapter.address];
    const data = [fraxData];
    const value = [0];
    const callType = [2];
    // const feeInfo = [{ fee: 0, recipient: zeroAddress() }];

    const balBefore = await ethers.provider.getBalance(deployer.address);
    const fraxEthBalBefore = await fraxEth.balanceOf(deployer.address);

    await batchTransaction.executeBatchCallsSameChain(
      0,
      tokens,
      amounts,
      "",
      targets,
      value,
      callType,
      data,
      { value: amount }
    );

    const balAfter = await ethers.provider.getBalance(deployer.address);
    const fraxEthBalAfter = await fraxEth.balanceOf(deployer.address);

    expect(balBefore).gt(balAfter);
    expect(fraxEthBalAfter).gt(fraxEthBalBefore);
  });

  it("FRAX_ETH: Can stake ETH on FRAX on dest chain when instruction is received from BatchTransaction contract", async () => {
    const {
      batchTransaction,
      fraxStakeEthAdapter,
      fraxEth,
      mockAssetForwarder,
    } = await setupTests();

    const amount = "100000000000000000";
    const txType = "1";

    const targets = [fraxStakeEthAdapter.address];
    const data = [
      defaultAbiCoder.encode(
        ["address", "uint256", "uint256"],
        [deployer.address, amount, txType]
      ),
    ];
    const value = [0];
    const callType = [2];

    const assetForwarderData = defaultAbiCoder.encode(
      ["uint256", "address", "address[]", "uint256[]", "uint256[]", "bytes[]"],
      [0, deployer.address, targets, value, callType, data]
    );

    const balBefore = await ethers.provider.getBalance(deployer.address);
    const fraxEthBalBefore = await fraxEth.balanceOf(deployer.address);

    await mockAssetForwarder.handleMessage(
      NATIVE_TOKEN,
      amount,
      assetForwarderData,
      batchTransaction.address,
      { value: amount }
    );

    const balAfter = await ethers.provider.getBalance(deployer.address);
    const fraxEthBalAfter = await fraxEth.balanceOf(deployer.address);

    expect(balAfter).lt(balBefore);
    expect(fraxEthBalAfter).gt(fraxEthBalBefore);
  });

  it("SFRAX_ETH: Can stake on frax on same chain", async () => {
    const { batchTransaction, fraxStakeEthAdapter, sFraxEth } =
      await setupTests();

    const amount = ethers.utils.parseEther("1");
    const txType = "2";

    const fraxData = defaultAbiCoder.encode(
      ["address", "uint256", "uint256"],
      [deployer.address, amount, txType]
    );

    const tokens = [NATIVE_TOKEN];
    const amounts = [amount];
    const targets = [fraxStakeEthAdapter.address];
    const data = [fraxData];
    const value = [0];
    const callType = [2];
    // const feeInfo = [{ fee: 0, recipient: zeroAddress() }];

    const balBefore = await ethers.provider.getBalance(deployer.address);
    const sFraxEthBalBefore = await sFraxEth.balanceOf(deployer.address);

    await batchTransaction.executeBatchCallsSameChain(
      0,
      tokens,
      amounts,
      "",
      targets,
      value,
      callType,
      data,
      { value: amount }
    );

    const balAfter = await ethers.provider.getBalance(deployer.address);
    const sFraxEthBalAfter = await sFraxEth.balanceOf(deployer.address);

    expect(balBefore).gt(balAfter);
    expect(sFraxEthBalAfter).gt(sFraxEthBalBefore);
  });

  it("SFRAX_ETH: Can stake ETH on FRAX on dest chain when instruction is received from BatchTransaction contract", async () => {
    const {
      batchTransaction,
      fraxStakeEthAdapter,
      sFraxEth,
      mockAssetForwarder,
    } = await setupTests();

    const amount = "100000000000000000";
    const txType = "2";

    const targets = [fraxStakeEthAdapter.address];
    const data = [
      defaultAbiCoder.encode(
        ["address", "uint256", "uint256"],
        [deployer.address, amount, txType]
      ),
    ];
    const value = [0];
    const callType = [2];

    const assetForwarderData = defaultAbiCoder.encode(
      ["uint256", "address", "address[]", "uint256[]", "uint256[]", "bytes[]"],
      [0, deployer.address, targets, value, callType, data]
    );

    const balBefore = await ethers.provider.getBalance(deployer.address);
    const sFraxEthBalBefore = await sFraxEth.balanceOf(deployer.address);

    await mockAssetForwarder.handleMessage(
      NATIVE_TOKEN,
      amount,
      assetForwarderData,
      batchTransaction.address,
      { value: amount }
    );

    const balAfter = await ethers.provider.getBalance(deployer.address);
    const sFraxEthBalAfter = await sFraxEth.balanceOf(deployer.address);

    expect(balAfter).lt(balBefore);
    expect(sFraxEthBalAfter).gt(sFraxEthBalBefore);
  });

  it("CanNOT stake on frax on same chain if invalid txtype", async () => {
    const { batchTransaction, fraxStakeEthAdapter } = await setupTests();

    const amount = ethers.utils.parseEther("1");
    const txType = "3";

    const fraxData = defaultAbiCoder.encode(
      ["address", "uint256", "uint256"],
      [deployer.address, amount, txType]
    );

    const tokens = [NATIVE_TOKEN];
    const amounts = [amount];
    const targets = [fraxStakeEthAdapter.address];
    const data = [fraxData];
    const value = [0];
    const callType = [2];
    // const feeInfo = [{ fee: 0, recipient: zeroAddress() }];

    await expect(
      batchTransaction.executeBatchCallsSameChain(
        0,
        tokens,
        amounts,
        "",
        targets,
        value,
        callType,
        data,
        { value: amount }
      )
    ).to.be.reverted;
  });
});
