import hardhat, { ethers, waffle } from "hardhat";
import { expect } from "chai";
import { RPC } from "../constants";
import { DEXSPAN, DEFAULT_ENV, NATIVE, WNATIVE } from "../../tasks/constants";
import { DineroStakeEth__factory } from "../../typechain/factories/DineroStakeEth__factory";
import { TokenInterface__factory } from "../../typechain/factories/TokenInterface__factory";
import { MockAssetForwarder__factory } from "../../typechain/factories/MockAssetForwarder__factory";
import { BatchTransaction__factory } from "../../typechain/factories/BatchTransaction__factory";
import { defaultAbiCoder } from "ethers/lib/utils";
import { DexSpanAdapter__factory } from "../../typechain/factories/DexSpanAdapter__factory";

const CHAIN_ID = "5";
const PX_ETH = "0xAb29c0217520C94F61dAB10E0A2C5079366D9384";
const PIREX_POOL = "0xD079c25d08208EB7BDb067D59Ec8D46abF6255b6";
const NATIVE_TOKEN = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const USDT = "0x2227E4764be4c858E534405019488D9E5890Ff9E";

describe("DineroStakeEth Adapter: ", async () => {
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

    const DineroStakeEth = await ethers.getContractFactory("DineroStakeEth");
    const dineroStakeEthAdapter = await DineroStakeEth.deploy(
      NATIVE,
      WNATIVE[env][CHAIN_ID],
      PX_ETH,
      PIREX_POOL
    );

    await batchTransaction.setAdapterWhitelist(
      [dexSpanAdapter.address, dineroStakeEthAdapter.address],
      [true, true]
    );

    return {
      batchTransaction: BatchTransaction__factory.connect(
        batchTransaction.address,
        deployer
      ),
      dineroStakeEthAdapter: DineroStakeEth__factory.connect(
        dineroStakeEthAdapter.address,
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
      pxEth: TokenInterface__factory.connect(PX_ETH, deployer),
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

  it("Can stake on dinero on same chain", async () => {
    const { batchTransaction, dineroStakeEthAdapter, pxEth } =
      await setupTests();

    const amount = ethers.utils.parseEther("1");

    const dineroData = defaultAbiCoder.encode(
      ["address", "uint256", "bool"],
      [deployer.address, amount, false]
    );

    const tokens = [NATIVE_TOKEN];
    const amounts = [amount];
    const targets = [dineroStakeEthAdapter.address];
    const data = [dineroData];
    const value = [0];
    const callType = [2];

    const balBefore = await ethers.provider.getBalance(deployer.address);
    const pxEthBalBefore = await pxEth.balanceOf(deployer.address);

    await batchTransaction.executeBatchCallsSameChain(
      0,
      tokens,
      amounts,
      targets,
      value,
      callType,
      data,
      { value: amount, gasLimit: 10000000 }
    );

    const balAfter = await ethers.provider.getBalance(deployer.address);
    const pxEthBalAfter = await pxEth.balanceOf(deployer.address);

    expect(balBefore).gt(balAfter);
    expect(pxEthBalAfter).gt(pxEthBalBefore);
  });

  it("Can stake ETH on Dinero on dest chain when instruction is received from BatchTransaction contract", async () => {
    const {
      batchTransaction,
      dineroStakeEthAdapter,
      pxEth,
      mockAssetForwarder,
    } = await setupTests();

    const amount = "100000000000000000";

    const targets = [dineroStakeEthAdapter.address];
    const data = [
      defaultAbiCoder.encode(
        ["address", "uint256", "bool"],
        [deployer.address, amount, false]
      ),
    ];
    const value = [0];
    const callType = [2];

    const assetForwarderData = defaultAbiCoder.encode(
      ["uint256", "address", "address[]", "uint256[]", "uint256[]", "bytes[]"],
      [0, deployer.address, targets, value, callType, data]
    );

    const balBefore = await ethers.provider.getBalance(deployer.address);
    const pxEthBalBefore = await pxEth.balanceOf(deployer.address);

    await mockAssetForwarder.handleMessage(
      NATIVE_TOKEN,
      amount,
      assetForwarderData,
      batchTransaction.address,
      { value: amount }
    );

    const balAfter = await ethers.provider.getBalance(deployer.address);
    const pxEthBalAfter = await pxEth.balanceOf(deployer.address);

    expect(balAfter).lt(balBefore);
    expect(pxEthBalAfter).gt(pxEthBalBefore);
  });
});
