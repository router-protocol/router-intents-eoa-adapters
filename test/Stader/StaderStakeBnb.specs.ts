import hardhat, { ethers, waffle } from "hardhat";
import { expect } from "chai";
import { RPC } from "../constants";
import {
  DEXSPAN,
  DEFAULT_ENV,
  WNATIVE,
  DEFAULT_REFUND_ADDRESS,
} from "../../tasks/constants";
import { StaderStakeBnb__factory } from "../../typechain/factories/StaderStakeBnb__factory";
import { TokenInterface__factory } from "../../typechain/factories/TokenInterface__factory";
import { MockAssetForwarder__factory } from "../../typechain/factories/MockAssetForwarder__factory";
import { BatchTransaction__factory } from "../../typechain/factories/BatchTransaction__factory";
import { defaultAbiCoder } from "ethers/lib/utils";

const CHAIN_ID = "56";
const STADER_X_TOKEN = "0x1bdd3Cf7F79cfB8EdbB955f20ad99211551BA275";
const STADER_POOL = "0x7276241a669489E4BBB76f63d2A43Bfe63080F2F";
const NATIVE_TOKEN = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const USDT = "0x55d398326f99059ff775485246999027b3197955";

describe("StaderStakeBnb Adapter: ", async () => {
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

    const StaderStakeBnb = await ethers.getContractFactory("StaderStakeBnb");
    const staderStakeBnbAdapter = await StaderStakeBnb.deploy(
      NATIVE_TOKEN,
      WNATIVE[env][CHAIN_ID],
      mockAssetForwarder.address,
      DEXSPAN[env][CHAIN_ID],
      DEFAULT_REFUND_ADDRESS,
      deployer.address,
      STADER_X_TOKEN,
      STADER_POOL
    );

    return {
      batchTransaction: BatchTransaction__factory.connect(
        batchTransaction.address,
        deployer
      ),
      staderStakeBnbAdapter: StaderStakeBnb__factory.connect(
        staderStakeBnbAdapter.address,
        deployer
      ),
      mockAssetForwarder: MockAssetForwarder__factory.connect(
        mockAssetForwarder.address,
        deployer
      ),
      usdt: TokenInterface__factory.connect(USDT, deployer),
      bnbx: TokenInterface__factory.connect(STADER_X_TOKEN, deployer),
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
    const { batchTransaction, staderStakeBnbAdapter, bnbx } =
      await setupTests();

    const amount = ethers.utils.parseEther("1");

    const staderData = defaultAbiCoder.encode(
      ["address", "uint256"],
      [deployer.address, amount]
    );

    const tokens = [NATIVE_TOKEN];
    const amounts = [amount];
    const targets = [staderStakeBnbAdapter.address];
    const data = [staderData];
    const value = [0];
    const callType = [2];

    const balBefore = await ethers.provider.getBalance(deployer.address);
    const bnbxBalBefore = await bnbx.balanceOf(deployer.address);

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
    const bnbxBalAfter = await bnbx.balanceOf(deployer.address);

    expect(balBefore).gt(balAfter);
    expect(bnbxBalAfter).gt(bnbxBalBefore);
  });

  it("Can stake BNB on Stader on dest chain when instruction is received from BatchTransaction contract", async () => {
    const {
      batchTransaction,
      staderStakeBnbAdapter,
      bnbx,
      mockAssetForwarder,
    } = await setupTests();

    const amount = "100000000000000000";

    const targets = [staderStakeBnbAdapter.address];
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
    const bnbxBalBefore = await bnbx.balanceOf(deployer.address);

    await mockAssetForwarder.handleMessage(
      NATIVE_TOKEN,
      amount,
      assetForwarderData,
      batchTransaction.address,
      { value: amount }
    );

    const balAfter = await ethers.provider.getBalance(deployer.address);
    const bnbxBalAfter = await bnbx.balanceOf(deployer.address);

    expect(balAfter).lt(balBefore);
    expect(bnbxBalAfter).gt(bnbxBalBefore);
  });

  it("Can stake BNB on Stader on dest chain when instruction is received directly on StaderStakeBnb adapter", async () => {
    const { staderStakeBnbAdapter, bnbx, mockAssetForwarder } =
      await setupTests();

    const amount = "100000000000000000";

    const data = defaultAbiCoder.encode(["address"], [deployer.address]);

    const balBefore = await ethers.provider.getBalance(deployer.address);
    const bnbxBalBefore = await bnbx.balanceOf(deployer.address);

    await mockAssetForwarder.handleMessage(
      NATIVE_TOKEN,
      amount,
      data,
      staderStakeBnbAdapter.address,
      { value: amount }
    );

    const balAfter = await ethers.provider.getBalance(deployer.address);
    const bnbxBalAfter = await bnbx.balanceOf(deployer.address);

    expect(balAfter).lt(balBefore);
    expect(bnbxBalAfter).gt(bnbxBalBefore);
  });
});
