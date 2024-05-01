import hardhat, { ethers, waffle } from "hardhat";
import { expect } from "chai";
import { RPC } from "../constants";
import { DEXSPAN, DEFAULT_ENV, NATIVE, WNATIVE } from "../../tasks/constants";
import { StaderStakeEth__factory } from "../../typechain/factories/StaderStakeEth__factory";
import { TokenInterface__factory } from "../../typechain/factories/TokenInterface__factory";
import { MockAssetForwarder__factory } from "../../typechain/factories/MockAssetForwarder__factory";
import { BatchTransaction__factory } from "../../typechain/factories/BatchTransaction__factory";
import { defaultAbiCoder } from "ethers/lib/utils";
import { DexSpanAdapter__factory } from "../../typechain/factories/DexSpanAdapter__factory";

const CHAIN_ID = "5";
const STADER_X_TOKEN = "0x3338eCd3ab3d3503c55c931d759fA6d78d287236";
const STADER_POOL = "0xd0e400Ec6Ed9C803A9D9D3a602494393E806F823";
const NATIVE_TOKEN = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const USDT = "0x2227E4764be4c858E534405019488D9E5890Ff9E";

describe("StaderStakeEth Adapter: ", async () => {
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
      DEXSPAN[env][CHAIN_ID]
    );

    const DexSpanAdapter = await ethers.getContractFactory("DexSpanAdapter");
    const dexSpanAdapter = await DexSpanAdapter.deploy(
      NATIVE,
      WNATIVE[env][CHAIN_ID],
      DEXSPAN[env][CHAIN_ID]
    );

    const StaderStakeEth = await ethers.getContractFactory("StaderStakeEth");
    const staderStakeEthAdapter = await StaderStakeEth.deploy(
      NATIVE,
      WNATIVE[env][CHAIN_ID],
      STADER_X_TOKEN,
      STADER_POOL
    );

    await batchTransaction.setAdapterWhitelist(
      [dexSpanAdapter.address, staderStakeEthAdapter.address],
      [true, true]
    );

    return {
      batchTransaction: BatchTransaction__factory.connect(
        batchTransaction.address,
        deployer
      ),
      staderStakeEthAdapter: StaderStakeEth__factory.connect(
        staderStakeEthAdapter.address,
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
      ethx: TokenInterface__factory.connect(STADER_X_TOKEN, deployer),
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

  it("Can stake on stader on same chain", async () => {
    const { batchTransaction, staderStakeEthAdapter, ethx } =
      await setupTests();

    const amount = ethers.utils.parseEther("1");

    const staderData = defaultAbiCoder.encode(
      ["address", "uint256"],
      [deployer.address, amount]
    );

    const tokens = [NATIVE_TOKEN];
    const amounts = [amount];
    const targets = [staderStakeEthAdapter.address];
    const data = [staderData];
    const value = [0];
    const callType = [2];

    const balBefore = await ethers.provider.getBalance(deployer.address);
    const ethxBalBefore = await ethx.balanceOf(deployer.address);

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

    const balAfter = await ethers.provider.getBalance(deployer.address);
    const ethxBalAfter = await ethx.balanceOf(deployer.address);

    expect(balBefore).gt(balAfter);
    expect(ethxBalAfter).gt(ethxBalBefore);
  });

  it("Can stake ETH on Stader on dest chain when instruction is received from BatchTransaction contract", async () => {
    const {
      batchTransaction,
      staderStakeEthAdapter,
      ethx,
      mockAssetForwarder,
    } = await setupTests();

    const amount = "100000000000000000";

    const targets = [staderStakeEthAdapter.address];
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
    const ethxBalBefore = await ethx.balanceOf(deployer.address);

    await mockAssetForwarder.handleMessage(
      NATIVE_TOKEN,
      amount,
      assetForwarderData,
      batchTransaction.address,
      { value: amount }
    );

    const balAfter = await ethers.provider.getBalance(deployer.address);
    const ethxBalAfter = await ethx.balanceOf(deployer.address);

    expect(balAfter).lt(balBefore);
    expect(ethxBalAfter).gt(ethxBalBefore);
  });
});
