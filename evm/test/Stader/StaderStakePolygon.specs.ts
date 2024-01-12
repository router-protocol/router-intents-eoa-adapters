import hardhat, { ethers, waffle } from "hardhat";
import { expect } from "chai";
import { RPC } from "../constants";
import { DEXSPAN, DEFAULT_ENV, WNATIVE } from "../../tasks/constants";
import { StaderStakePolygon__factory } from "../../typechain/factories/StaderStakePolygon__factory";
import { TokenInterface__factory } from "../../typechain/factories/TokenInterface__factory";
import { MockAssetForwarder__factory } from "../../typechain/factories/MockAssetForwarder__factory";
import { BatchTransaction__factory } from "../../typechain/factories/BatchTransaction__factory";
import { defaultAbiCoder } from "ethers/lib/utils";

const CHAIN_ID = "137";
const STADER_X_TOKEN = "0xfa68FB4628DFF1028CFEc22b4162FCcd0d45efb6";
const STADER_POOL = "0xfd225C9e6601C9d38d8F98d8731BF59eFcF8C0E3";
const NATIVE_TOKEN = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const USDT = "0xc2132d05d31c914a87c6611c10748aeb04b58e8f";

describe("StaderStakePolygon Adapter: ", async () => {
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
      WNATIVE[env][CHAIN_ID],
      mockAssetForwarder.address,
      DEXSPAN[env][CHAIN_ID]
    );

    const StaderStakePolygon = await ethers.getContractFactory(
      "StaderStakePolygon"
    );
    const staderStakePolygonAdapter = await StaderStakePolygon.deploy(
      NATIVE_TOKEN,
      WNATIVE[env][CHAIN_ID],
      STADER_X_TOKEN,
      STADER_POOL
    );

    await batchTransaction.setAdapterWhitelist(
      [staderStakePolygonAdapter.address],
      [true]
    );

    return {
      batchTransaction: BatchTransaction__factory.connect(
        batchTransaction.address,
        deployer
      ),
      staderStakePolygonAdapter: StaderStakePolygon__factory.connect(
        staderStakePolygonAdapter.address,
        deployer
      ),
      mockAssetForwarder: MockAssetForwarder__factory.connect(
        mockAssetForwarder.address,
        deployer
      ),
      usdt: TokenInterface__factory.connect(USDT, deployer),
      maticx: TokenInterface__factory.connect(STADER_X_TOKEN, deployer),
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
    const { batchTransaction, staderStakePolygonAdapter, maticx } =
      await setupTests();

    const amount = ethers.utils.parseEther("1");

    const staderData = defaultAbiCoder.encode(
      ["address", "uint256"],
      [deployer.address, amount]
    );

    const tokens = [NATIVE_TOKEN];
    const amounts = [amount];
    const targets = [staderStakePolygonAdapter.address];
    const data = [staderData];
    const value = [0];
    const callType = [2];

    const balBefore = await ethers.provider.getBalance(deployer.address);
    const maticxBalBefore = await maticx.balanceOf(deployer.address);

    await batchTransaction.executeBatchCallsSameChain(
      tokens,
      amounts,
      targets,
      value,
      callType,
      data,
      { value: amount }
    );

    const balAfter = await ethers.provider.getBalance(deployer.address);
    const maticxBalAfter = await maticx.balanceOf(deployer.address);

    expect(balBefore).gt(balAfter);
    expect(maticxBalAfter).gt(maticxBalBefore);
  });

  it("Can stake Matic on Stader on dest chain when instruction is received from BatchTransaction contract", async () => {
    const {
      batchTransaction,
      staderStakePolygonAdapter,
      maticx,
      mockAssetForwarder,
    } = await setupTests();

    const amount = "100000000000000000";

    const targets = [staderStakePolygonAdapter.address];
    const data = [
      defaultAbiCoder.encode(
        ["address", "uint256"],
        [deployer.address, amount]
      ),
    ];
    const value = [0];
    const callType = [2];

    const assetForwarderData = defaultAbiCoder.encode(
      ["address", "address[]", "uint256[]", "uint256[]", "bytes[]"],
      [deployer.address, targets, value, callType, data]
    );

    const balBefore = await ethers.provider.getBalance(deployer.address);
    const maticxBalBefore = await maticx.balanceOf(deployer.address);

    await mockAssetForwarder.handleMessage(
      NATIVE_TOKEN,
      amount,
      assetForwarderData,
      batchTransaction.address,
      { value: amount }
    );

    const balAfter = await ethers.provider.getBalance(deployer.address);
    const maticxBalAfter = await maticx.balanceOf(deployer.address);

    expect(balAfter).lt(balBefore);
    expect(maticxBalAfter).gt(maticxBalBefore);
  });
});
