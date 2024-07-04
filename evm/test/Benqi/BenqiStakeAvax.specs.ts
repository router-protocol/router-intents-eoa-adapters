import hardhat, { ethers, waffle } from "hardhat";
import { expect } from "chai";
import { RPC } from "../constants";
import { DEXSPAN, DEFAULT_ENV, NATIVE, WNATIVE } from "../../tasks/constants";
import { BenqiStakeAvax__factory } from "../../typechain/factories/BenqiStakeAvax__factory";
import { TokenInterface__factory } from "../../typechain/factories/TokenInterface__factory";
import { MockAssetForwarder__factory } from "../../typechain/factories/MockAssetForwarder__factory";
import { BatchTransaction__factory } from "../../typechain/factories/BatchTransaction__factory";
import { defaultAbiCoder } from "ethers/lib/utils";
import { DexSpanAdapter__factory } from "../../typechain/factories/DexSpanAdapter__factory";
import { zeroAddress } from "ethereumjs-util";
import { MaxUint256 } from "@ethersproject/constants";

const CHAIN_ID = "43114";
const BENQI_TOKEN = "0x2b2C81e08f1Af8835a78Bb2A90AE924ACE0eA4bE";
const NATIVE_TOKEN = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const USDT = "0x9702230a8ea53601f5cd2dc00fdbc13d4df4a8c7";

describe("BenqiStakeAvax Adapter: ", async () => {
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

    const BenqiStakeAvax = await ethers.getContractFactory("BenqiStakeAvax");
    const benqiStakeAvaxAdapter = await BenqiStakeAvax.deploy(
      NATIVE,
      WNATIVE[env][CHAIN_ID],
      BENQI_TOKEN
    );

    await batchTransaction.setAdapterWhitelist(
      [dexSpanAdapter.address, benqiStakeAvaxAdapter.address],
      [true, true]
    );

    return {
      batchTransaction: BatchTransaction__factory.connect(
        batchTransaction.address,
        deployer
      ),
      benqiStakeAvaxAdapter: BenqiStakeAvax__factory.connect(
        benqiStakeAvaxAdapter.address,
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
      benqiSAvax: TokenInterface__factory.connect(BENQI_TOKEN, deployer),
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

  it("Can stake on benqi on same chain", async () => {
    const { batchTransaction, benqiStakeAvaxAdapter, benqiSAvax } =
      await setupTests();

    const amount = ethers.utils.parseEther("1");

    const benqiData = defaultAbiCoder.encode(
      ["address", "uint256"],
      [deployer.address, MaxUint256]
    );

    const tokens = [NATIVE_TOKEN];
    const amounts = [amount];
    const feeInfo = [
      { fee: amount.mul(5).div(1000), recipient: alice.address },
    ];
    const targets = [benqiStakeAvaxAdapter.address];
    const data = [benqiData];
    const value = [0];
    const callType = [2];

    const balBefore = await ethers.provider.getBalance(deployer.address);
    const benqiSAvaxBalBefore = await benqiSAvax.balanceOf(deployer.address);

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
    const benqiSAvaxBalAfter = await benqiSAvax.balanceOf(deployer.address);

    expect(balBefore).gt(balAfter);
    expect(benqiSAvaxBalAfter).gt(benqiSAvaxBalBefore);
  });

  it("Can stake AVAX on Benqi on dest chain when instruction is received from BatchTransaction contract", async () => {
    const {
      batchTransaction,
      benqiStakeAvaxAdapter,
      benqiSAvax,
      mockAssetForwarder,
    } = await setupTests();

    const amount = ethers.utils.parseEther("1");

    const targets = [benqiStakeAvaxAdapter.address];
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
    const benqiSAvaxBalBefore = await benqiSAvax.balanceOf(deployer.address);

    await mockAssetForwarder.handleMessage(
      NATIVE_TOKEN,
      amount,
      assetForwarderData,
      batchTransaction.address,
      { value: amount }
    );

    const balAfter = await ethers.provider.getBalance(deployer.address);
    const benqiSAvaxBalAfter = await benqiSAvax.balanceOf(deployer.address);

    expect(balAfter).lt(balBefore);
    expect(benqiSAvaxBalAfter).gt(benqiSAvaxBalBefore);
  });
});
