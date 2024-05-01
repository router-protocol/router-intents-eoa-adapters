import hardhat, { ethers, waffle } from "hardhat";
import { expect } from "chai";
import { RPC } from "../constants";
import { DEXSPAN, DEFAULT_ENV, NATIVE, WNATIVE } from "../../tasks/constants";
import { AnkrStakeFantom__factory } from "../../typechain/factories/AnkrStakeFantom__factory";
import { TokenInterface__factory } from "../../typechain/factories/TokenInterface__factory";
import { MockAssetForwarder__factory } from "../../typechain/factories/MockAssetForwarder__factory";
import { BatchTransaction__factory } from "../../typechain/factories/BatchTransaction__factory";
import { defaultAbiCoder } from "ethers/lib/utils";
import { DexSpanAdapter__factory } from "../../typechain/factories/DexSpanAdapter__factory";

const CHAIN_ID = "250";
const ANKR_TOKEN = "0xCfC785741Dc0e98ad4c9F6394Bb9d43Cd1eF5179";
const ANKR_POOL = "0x84db6eE82b7Cf3b47E8F19270abdE5718B936670";
const NATIVE_TOKEN = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const USDT = "0x049d68029688eabf473097a2fc38ef61633a3c7a";

describe("AnkrStakeFantom Adapter: ", async () => {
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

    const AnkrStakeFantom = await ethers.getContractFactory("AnkrStakeFantom");
    const ankrStakeFantomAdapter = await AnkrStakeFantom.deploy(
      NATIVE,
      WNATIVE[env][CHAIN_ID],
      ANKR_TOKEN,
      ANKR_POOL
    );

    await batchTransaction.setAdapterWhitelist(
      [dexSpanAdapter.address, ankrStakeFantomAdapter.address],
      [true, true]
    );

    return {
      batchTransaction: BatchTransaction__factory.connect(
        batchTransaction.address,
        deployer
      ),
      ankrStakeFantomAdapter: AnkrStakeFantom__factory.connect(
        ankrStakeFantomAdapter.address,
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
    const { batchTransaction, ankrStakeFantomAdapter, ankrEth } =
      await setupTests();

    const amount = ethers.utils.parseEther("1");

    const ankrData = defaultAbiCoder.encode(
      ["address", "uint256"],
      [deployer.address, amount]
    );

    const tokens = [NATIVE_TOKEN];
    const amounts = [amount];
    const targets = [ankrStakeFantomAdapter.address];
    const data = [ankrData];
    const value = [0];
    const callType = [2];

    const balBefore = await ethers.provider.getBalance(deployer.address);
    const ankrEthBalBefore = await ankrEth.balanceOf(deployer.address);

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
    const ankrEthBalAfter = await ankrEth.balanceOf(deployer.address);

    expect(balBefore).gt(balAfter);
    expect(ankrEthBalAfter).gt(ankrEthBalBefore);
  });

  it("Can stake FTM on Ankr on dest chain when instruction is received from BatchTransaction contract", async () => {
    const {
      batchTransaction,
      ankrStakeFantomAdapter,
      ankrEth,
      mockAssetForwarder,
    } = await setupTests();

    const amount = ethers.utils.parseEther("1");

    const targets = [ankrStakeFantomAdapter.address];
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
