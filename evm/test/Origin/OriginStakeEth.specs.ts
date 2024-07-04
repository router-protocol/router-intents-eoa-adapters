import hardhat, { ethers, waffle } from "hardhat";
import { expect } from "chai";
import { RPC } from "../constants";
import { DEXSPAN, DEFAULT_ENV, NATIVE, WNATIVE } from "../../tasks/constants";
import { OriginStakeEth__factory } from "../../typechain/factories/OriginStakeEth__factory";
import { TokenInterface__factory } from "../../typechain/factories/TokenInterface__factory";
import { MockAssetForwarder__factory } from "../../typechain/factories/MockAssetForwarder__factory";
import { BatchTransaction__factory } from "../../typechain/factories/BatchTransaction__factory";
import { defaultAbiCoder } from "ethers/lib/utils";
import { DexSpanAdapter__factory } from "../../typechain/factories/DexSpanAdapter__factory";
import { zeroAddress } from "ethereumjs-util";

const CHAIN_ID = "1";
const O_TOKEN = "0x856c4Efb76C1D1AE02e20CEB03A2A6a08b0b8dC3";
const ORIGIN_POOL = "0x9858e47BCbBe6fBAC040519B02d7cd4B2C470C66";
const NATIVE_TOKEN = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const USDT = "0xdac17f958d2ee523a2206206994597c13d831ec7";

describe("OriginStakeEth Adapter: ", async () => {
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
      zeroAddress()
    );

    const DexSpanAdapter = await ethers.getContractFactory("DexSpanAdapter");
    const dexSpanAdapter = await DexSpanAdapter.deploy(
      NATIVE,
      WNATIVE[env][CHAIN_ID],
      DEXSPAN[env][CHAIN_ID]
    );

    const OriginStakeEth = await ethers.getContractFactory("OriginStakeEth");
    const originStakeEthAdapter = await OriginStakeEth.deploy(
      NATIVE,
      WNATIVE[env][CHAIN_ID],
      O_TOKEN,
      ORIGIN_POOL
    );

    await batchTransaction.setAdapterWhitelist(
      [dexSpanAdapter.address, originStakeEthAdapter.address],
      [true, true]
    );

    return {
      batchTransaction: BatchTransaction__factory.connect(
        batchTransaction.address,
        deployer
      ),
      originStakeEthAdapter: OriginStakeEth__factory.connect(
        originStakeEthAdapter.address,
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
      oEth: TokenInterface__factory.connect(O_TOKEN, deployer),
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

  it("Can stake on origin on same chain", async () => {
    const { batchTransaction, originStakeEthAdapter, oEth } =
      await setupTests();

    const amount = ethers.utils.parseEther("1");

    const originData = defaultAbiCoder.encode(
      ["address", "uint256"],
      [deployer.address, amount]
    );

    const tokens = [NATIVE_TOKEN];
    const amounts = [amount];
    const targets = [originStakeEthAdapter.address];
    const data = [originData];
    const value = [0];
    const callType = [2];
    const feeInfo = [{ fee: 0, recipient: zeroAddress() }];

    const balBefore = await ethers.provider.getBalance(deployer.address);
    const oEthBalBefore = await oEth.balanceOf(deployer.address);

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
    const oEthBalAfter = await oEth.balanceOf(deployer.address);

    expect(balBefore).gt(balAfter);
    expect(oEthBalAfter).gt(oEthBalBefore);
  });

  it("Can stake ETH on Origin on dest chain when instruction is received from BatchTransaction contract", async () => {
    const {
      batchTransaction,
      originStakeEthAdapter,
      oEth,
      mockAssetForwarder,
    } = await setupTests();

    const amount = "100000000000000000";

    const targets = [originStakeEthAdapter.address];
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
    const oEthBalBefore = await oEth.balanceOf(deployer.address);

    await mockAssetForwarder.handleMessage(
      NATIVE_TOKEN,
      amount,
      assetForwarderData,
      batchTransaction.address,
      { value: amount }
    );

    const balAfter = await ethers.provider.getBalance(deployer.address);
    const oEthBalAfter = await oEth.balanceOf(deployer.address);

    expect(balAfter).lt(balBefore);
    expect(oEthBalAfter).gt(oEthBalBefore);
  });
});
