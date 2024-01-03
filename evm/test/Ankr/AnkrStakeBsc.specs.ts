import hardhat, { ethers, waffle } from "hardhat";
import { expect } from "chai";
import { RPC } from "../constants";
import {
  DEXSPAN,
  DEFAULT_ENV,
  NATIVE,
  WNATIVE,
  DEFAULT_REFUND_ADDRESS,
} from "../../tasks/constants";
import { AnkrStakeBsc__factory } from "../../typechain/factories/AnkrStakeBsc__factory";
import { TokenInterface__factory } from "../../typechain/factories/TokenInterface__factory";
import { MockAssetForwarder__factory } from "../../typechain/factories/MockAssetForwarder__factory";
import { BatchTransaction__factory } from "../../typechain/factories/BatchTransaction__factory";
import { BigNumber, Contract, Wallet } from "ethers";
import { getPathfinderData } from "../utils";
import { defaultAbiCoder } from "ethers/lib/utils";
import { DexSpanAdapter__factory } from "../../typechain/factories/DexSpanAdapter__factory";

const CHAIN_ID = "56";
const ANKR_TOKEN = "0x52F24a5e03aee338Da5fd9Df68D2b6FAe1178827";
const ANKR_POOL = "0x9e347Af362059bf2E55839002c699F7A5BaFE86E";
const NATIVE_TOKEN = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const USDT = "0x55d398326f99059ff775485246999027b3197955";

describe("AnkrStakeBsc Adapter: ", async () => {
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
      deployer.address,
      mockAssetForwarder.address,
      DEXSPAN[env][CHAIN_ID],
      DEFAULT_REFUND_ADDRESS
    );

    const AnkrStakeBsc = await ethers.getContractFactory("AnkrStakeBsc");
    const ankrStakeBscAdapter = await AnkrStakeBsc.deploy(
      NATIVE,
      WNATIVE[env][CHAIN_ID],
      deployer.address,
      mockAssetForwarder.address,
      DEXSPAN[env][CHAIN_ID],
      ANKR_TOKEN,
      ANKR_POOL
    );

    return {
      batchTransaction: BatchTransaction__factory.connect(
        batchTransaction.address,
        deployer
      ),
      ankrStakeBscAdapter: AnkrStakeBsc__factory.connect(
        ankrStakeBscAdapter.address,
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

  const toBytes32 = (bn: BigNumber) => {
    return ethers.utils.hexlify(ethers.utils.zeroPad(bn.toHexString(), 32));
  };

  // This works for token when it has balance mapping at slot 0.
  const setUserTokenBalance = async (
    contract: Contract,
    user: Wallet,
    balance: BigNumber
  ) => {
    const index = ethers.utils.solidityKeccak256(
      ["uint256", "uint256"],
      [user.address, 0] // key, slot
    );

    await hardhat.network.provider.request({
      method: "hardhat_setStorageAt",
      params: [contract.address, index, toBytes32(balance).toString()],
    });

    await hardhat.network.provider.request({
      method: "evm_mine",
      params: [],
    });
  };

  it("Can stake on ankr on same chain", async () => {
    const { batchTransaction, ankrStakeBscAdapter, ankrEth } =
      await setupTests();

    const amount = ethers.utils.parseEther("1");

    const ankrData = defaultAbiCoder.encode(
      ["address", "uint256"],
      [deployer.address, amount]
    );

    const tokens = [NATIVE_TOKEN];
    const amounts = [amount];
    const targets = [ankrStakeBscAdapter.address];
    const data = [ankrData];
    const value = [0];
    const callType = [2];

    const balBefore = await ethers.provider.getBalance(deployer.address);
    const ankrEthBalBefore = await ankrEth.balanceOf(deployer.address);

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
    const ankrEthBalAfter = await ankrEth.balanceOf(deployer.address);

    expect(balBefore).gt(balAfter);
    expect(ankrEthBalAfter).gt(ankrEthBalBefore);
  });

  it("Can stake BSC on Ankr on dest chain when instruction is received from BatchTransaction contract", async () => {
    const {
      batchTransaction,
      ankrStakeBscAdapter,
      ankrEth,
      mockAssetForwarder,
    } = await setupTests();

    const amount = "100000000000000000";

    const targets = [ankrStakeBscAdapter.address];
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

  it("Can stake BSC on Ankr on dest chain when instruction is received directly on AnkrStakeBsc adapter", async () => {
    const { ankrStakeBscAdapter, ankrEth, mockAssetForwarder } =
      await setupTests();

    const amount = "100000000000000000";

    const data = defaultAbiCoder.encode(["address"], [deployer.address]);

    const balBefore = await ethers.provider.getBalance(deployer.address);
    const ankrEthBalBefore = await ankrEth.balanceOf(deployer.address);

    await mockAssetForwarder.handleMessage(
      NATIVE_TOKEN,
      amount,
      data,
      ankrStakeBscAdapter.address,
      { value: amount }
    );

    const balAfter = await ethers.provider.getBalance(deployer.address);
    const ankrEthBalAfter = await ankrEth.balanceOf(deployer.address);

    expect(balAfter).lt(balBefore);
    expect(ankrEthBalAfter).gt(ankrEthBalBefore);
  });
});
