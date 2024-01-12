import hardhat, { ethers, waffle } from "hardhat";
import { expect } from "chai";
import { RPC } from "../constants";
import { DEXSPAN, DEFAULT_ENV, NATIVE, WNATIVE } from "../../tasks/constants";
import { LidoStakeEth__factory } from "../../typechain/factories/LidoStakeEth__factory";
import { TokenInterface__factory } from "../../typechain/factories/TokenInterface__factory";
import { MockAssetForwarder__factory } from "../../typechain/factories/MockAssetForwarder__factory";
import { BatchTransaction__factory } from "../../typechain/factories/BatchTransaction__factory";
import { defaultAbiCoder } from "ethers/lib/utils";
import { DexSpanAdapter__factory } from "../../typechain/factories/DexSpanAdapter__factory";

const CHAIN_ID = "5";
const LIDO_ST_TOKEN = "0x1643E812aE58766192Cf7D2Cf9567dF2C37e9B7F";
const LIDO_REFERRAL_ADDRESS = "0x1643E812aE58766192Cf7D2Cf9567dF2C37e9B7F";
const NATIVE_TOKEN = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const USDT = "0x2227E4764be4c858E534405019488D9E5890Ff9E";

describe("LidoStakeEth Adapter: ", async () => {
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

    const LidoStakeEth = await ethers.getContractFactory("LidoStakeEth");
    const lidoStakeEthAdapter = await LidoStakeEth.deploy(
      NATIVE,
      WNATIVE[env][CHAIN_ID],
      LIDO_ST_TOKEN,
      LIDO_REFERRAL_ADDRESS
    );

    await batchTransaction.setAdapterWhitelist(
      [dexSpanAdapter.address, lidoStakeEthAdapter.address],
      [true, true]
    );

    return {
      batchTransaction: BatchTransaction__factory.connect(
        batchTransaction.address,
        deployer
      ),
      lidoStakeEthAdapter: LidoStakeEth__factory.connect(
        lidoStakeEthAdapter.address,
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
      steth: TokenInterface__factory.connect(LIDO_ST_TOKEN, deployer),
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

  it("Can stake on lido on same chain", async () => {
    const { batchTransaction, lidoStakeEthAdapter, steth } = await setupTests();

    const amount = ethers.utils.parseEther("1");

    const lidoData = defaultAbiCoder.encode(
      ["address", "uint256"],
      [deployer.address, amount]
    );

    const tokens = [NATIVE_TOKEN];
    const amounts = [amount];
    const targets = [lidoStakeEthAdapter.address];
    const data = [lidoData];
    const value = [0];
    const callType = [2];

    const balBefore = await ethers.provider.getBalance(deployer.address);
    const stethBalBefore = await steth.balanceOf(deployer.address);

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
    const stethBalAfter = await steth.balanceOf(deployer.address);

    expect(balBefore).gt(balAfter);
    expect(stethBalAfter).gt(stethBalBefore);
  });

  it("Can stake ETH on Lido on dest chain when instruction is received from BatchTransaction contract", async () => {
    const { batchTransaction, lidoStakeEthAdapter, steth, mockAssetForwarder } =
      await setupTests();

    const amount = ethers.utils.parseEther("1");

    const targets = [lidoStakeEthAdapter.address];
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
    const stethBalBefore = await steth.balanceOf(deployer.address);

    await mockAssetForwarder.handleMessage(
      NATIVE_TOKEN,
      amount,
      assetForwarderData,
      batchTransaction.address,
      { value: amount, gasLimit: 1000000 }
    );

    const balAfter = await ethers.provider.getBalance(deployer.address);
    const stethBalAfter = await steth.balanceOf(deployer.address);

    expect(balAfter).lt(balBefore);
    expect(stethBalAfter).gt(stethBalBefore);
  });
});
