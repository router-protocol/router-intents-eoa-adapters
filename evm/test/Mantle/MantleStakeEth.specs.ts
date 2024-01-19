import hardhat, { ethers, waffle } from "hardhat";
import { expect } from "chai";
import { RPC } from "../constants";
import { DEXSPAN, DEFAULT_ENV, NATIVE, WNATIVE } from "../../tasks/constants";
import { MantleStakeEth__factory } from "../../typechain/factories/MantleStakeEth__factory";
import { TokenInterface__factory } from "../../typechain/factories/TokenInterface__factory";
import { MockAssetForwarder__factory } from "../../typechain/factories/MockAssetForwarder__factory";
import { BatchTransaction__factory } from "../../typechain/factories/BatchTransaction__factory";
import { defaultAbiCoder } from "ethers/lib/utils";
import { DexSpanAdapter__factory } from "../../typechain/factories/DexSpanAdapter__factory";

const CHAIN_ID = "1";
const METH = "0xd5F7838F5C461fefF7FE49ea5ebaF7728bB0ADfa";
const MANTLE_POOL = "0xe3cBd06D7dadB3F4e6557bAb7EdD924CD1489E8f";
const NATIVE_TOKEN = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";

describe("MantleStakeEth Adapter: ", async () => {
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

    const MantleStakeEth = await ethers.getContractFactory("MantleStakeEth");
    const mantleStakeEthAdapter = await MantleStakeEth.deploy(
      NATIVE,
      WNATIVE[env][CHAIN_ID],
      METH,
      MANTLE_POOL
    );

    await batchTransaction.setAdapterWhitelist(
      [dexSpanAdapter.address, mantleStakeEthAdapter.address],
      [true, true]
    );

    return {
      batchTransaction: BatchTransaction__factory.connect(
        batchTransaction.address,
        deployer
      ),
      mantleStakeEthAdapter: MantleStakeEth__factory.connect(
        mantleStakeEthAdapter.address,
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
      mEth: TokenInterface__factory.connect(METH, deployer),
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

  it("Can stake on mantle on same chain", async () => {
    const { batchTransaction, mantleStakeEthAdapter, mEth } =
      await setupTests();

    const amount = ethers.utils.parseEther("1");

    const mantleData = defaultAbiCoder.encode(
      ["address", "uint256", "uint256"],
      [deployer.address, amount, "0"]
    );

    const tokens = [NATIVE_TOKEN];
    const amounts = [amount];
    const targets = [mantleStakeEthAdapter.address];
    const data = [mantleData];
    const value = [0];
    const callType = [2];

    const balBefore = await ethers.provider.getBalance(deployer.address);
    const mEthBalBefore = await mEth.balanceOf(deployer.address);

    await batchTransaction.executeBatchCallsSameChain(
      tokens,
      amounts,
      targets,
      value,
      callType,
      data,
      { value: amount,
        gasLimit:  10000000}
    );

    const balAfter = await ethers.provider.getBalance(deployer.address);
    const mEthBalAfter = await mEth.balanceOf(deployer.address);

    expect(balBefore).gt(balAfter);
    expect(mEthBalAfter).gt(mEthBalBefore);
  });

  it("Can stake ETH on Mantle on dest chain when instruction is received from BatchTransaction contract", async () => {
    const {
      batchTransaction,
      mantleStakeEthAdapter,
      mEth,
      mockAssetForwarder,
    } = await setupTests();

    const amount = "100000000000000000";

    const targets = [mantleStakeEthAdapter.address];
    const data = [
      defaultAbiCoder.encode(
        ["address", "uint256", "uint256"],
      [deployer.address, amount, "0"]
      ),
    ];
    const value = [0];
    const callType = [2];

    const assetForwarderData = defaultAbiCoder.encode(
      ["address", "address[]", "uint256[]", "uint256[]", "bytes[]"],
      [deployer.address, targets, value, callType, data]
    );

    const balBefore = await ethers.provider.getBalance(deployer.address);
    const mEthBalBefore = await mEth.balanceOf(deployer.address);

    await mockAssetForwarder.handleMessage(
      NATIVE_TOKEN,
      amount,
      assetForwarderData,
      batchTransaction.address,
      { value: amount }
    );

    const balAfter = await ethers.provider.getBalance(deployer.address);
    const mEthBalAfter = await mEth.balanceOf(deployer.address);

    expect(balAfter).lt(balBefore);
    expect(mEthBalAfter).gt(mEthBalBefore);
  });
});
