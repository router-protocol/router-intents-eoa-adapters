import hardhat, { ethers, waffle } from "hardhat";
import { expect } from "chai";
import { RPC } from "../constants";
import { DEXSPAN, DEFAULT_ENV, WNATIVE } from "../../tasks/constants";
import { StaderStakeFtm__factory } from "../../typechain/factories/StaderStakeFtm__factory";
import { TokenInterface__factory } from "../../typechain/factories/TokenInterface__factory";
import { MockAssetForwarder__factory } from "../../typechain/factories/MockAssetForwarder__factory";
import { BatchTransaction__factory } from "../../typechain/factories/BatchTransaction__factory";
import { defaultAbiCoder } from "ethers/lib/utils";

const CHAIN_ID = "250";
const STADER_X_TOKEN = "0xd7028092c830b5C8FcE061Af2E593413EbbC1fc1";
const STADER_POOL = "0xB458BfC855ab504a8a327720FcEF98886065529b";
const NATIVE_TOKEN = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const USDT = "0x049d68029688eabf473097a2fc38ef61633a3c7a";

describe("StaderStakeFtm Adapter: ", async () => {
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

    const StaderStakeFtm = await ethers.getContractFactory("StaderStakeFtm");
    const staderStakeFtmAdapter = await StaderStakeFtm.deploy(
      NATIVE_TOKEN,
      WNATIVE[env][CHAIN_ID],
      STADER_X_TOKEN,
      STADER_POOL
    );

    await batchTransaction.setAdapterWhitelist(
      [staderStakeFtmAdapter.address],
      [true]
    );

    return {
      batchTransaction: BatchTransaction__factory.connect(
        batchTransaction.address,
        deployer
      ),
      staderStakeFtmAdapter: StaderStakeFtm__factory.connect(
        staderStakeFtmAdapter.address,
        deployer
      ),
      mockAssetForwarder: MockAssetForwarder__factory.connect(
        mockAssetForwarder.address,
        deployer
      ),
      usdt: TokenInterface__factory.connect(USDT, deployer),
      sftmx: TokenInterface__factory.connect(STADER_X_TOKEN, deployer),
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
    const { batchTransaction, staderStakeFtmAdapter, sftmx } =
      await setupTests();

    const amount = ethers.utils.parseEther("1");

    const staderData = defaultAbiCoder.encode(
      ["address", "uint256"],
      [deployer.address, amount]
    );

    const tokens = [NATIVE_TOKEN];
    const amounts = [amount];
    const targets = [staderStakeFtmAdapter.address];
    const data = [staderData];
    const value = [0];
    const callType = [2];

    const balBefore = await ethers.provider.getBalance(deployer.address);
    const sftmxBalBefore = await sftmx.balanceOf(deployer.address);

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
    const sftmxBalAfter = await sftmx.balanceOf(deployer.address);

    expect(balBefore).gt(balAfter);
    expect(sftmxBalAfter).gt(sftmxBalBefore);
  });

  it("Can stake FTM on Stader on dest chain when instruction is received from BatchTransaction contract", async () => {
    const {
      batchTransaction,
      staderStakeFtmAdapter,
      sftmx,
      mockAssetForwarder,
    } = await setupTests();

    const amount = ethers.utils.parseEther("1");

    const targets = [staderStakeFtmAdapter.address];
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
    const sftmxBalBefore = await sftmx.balanceOf(deployer.address);

    await mockAssetForwarder.handleMessage(
      NATIVE_TOKEN,
      amount,
      assetForwarderData,
      batchTransaction.address,
      { value: amount, gasLimit: 10000000 }
    );

    const balAfter = await ethers.provider.getBalance(deployer.address);
    const sftmxBalAfter = await sftmx.balanceOf(deployer.address);

    expect(balAfter).lt(balBefore);
    expect(sftmxBalAfter).gt(sftmxBalBefore);
  });
});
