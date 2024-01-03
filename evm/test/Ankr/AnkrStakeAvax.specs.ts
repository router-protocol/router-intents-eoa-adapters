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
import { AnkrStakeAvax__factory } from "../../typechain/factories/AnkrStakeAvax__factory";
import { TokenInterface__factory } from "../../typechain/factories/TokenInterface__factory";
import { MockAssetForwarder__factory } from "../../typechain/factories/MockAssetForwarder__factory";
import { BatchTransaction__factory } from "../../typechain/factories/BatchTransaction__factory";
import { BigNumber, Contract, Wallet } from "ethers";
import { getPathfinderData } from "../utils";
import { defaultAbiCoder } from "ethers/lib/utils";
import { DexSpanAdapter__factory } from "../../typechain/factories/DexSpanAdapter__factory";

const CHAIN_ID = "43114";
const ANKR_TOKEN = "0xc3344870d52688874b06d844E0C36cc39FC727F6";
const ANKR_POOL = "0x7BAa1E3bFe49db8361680785182B80BB420A836D";
const NATIVE_TOKEN = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const USDT = "0x9702230a8ea53601f5cd2dc00fdbc13d4df4a8c7";

describe("AnkrStakeAvax Adapter: ", async () => {
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

    const AnkrStakeAvax = await ethers.getContractFactory("AnkrStakeAvax");
    const ankrStakeAvaxAdapter = await AnkrStakeAvax.deploy(
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
      ankrStakeAvaxAdapter: AnkrStakeAvax__factory.connect(
        ankrStakeAvaxAdapter.address,
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
    const { batchTransaction, ankrStakeAvaxAdapter, ankrEth } =
      await setupTests();

    const amount = ethers.utils.parseEther("1");

    const ankrData = defaultAbiCoder.encode(
      ["address", "uint256"],
      [deployer.address, amount]
    );

    const tokens = [NATIVE_TOKEN];
    const amounts = [amount];
    const targets = [ankrStakeAvaxAdapter.address];
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

  it("Can stake AVAX on Ankr on dest chain when instruction is received from BatchTransaction contract", async () => {
    const {
      batchTransaction,
      ankrStakeAvaxAdapter,
      ankrEth,
      mockAssetForwarder,
    } = await setupTests();

    const amount = ethers.utils.parseEther("1");

    const targets = [ankrStakeAvaxAdapter.address];
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

  it("Can stake AVAX on Ankr on dest chain when instruction is received directly on AnkrStakeAvax adapter", async () => {
    const { ankrStakeAvaxAdapter, ankrEth, mockAssetForwarder } =
      await setupTests();

    const amount = ethers.utils.parseEther("1");

    const data = defaultAbiCoder.encode(["address"], [deployer.address]);

    const balBefore = await ethers.provider.getBalance(deployer.address);
    const ankrEthBalBefore = await ankrEth.balanceOf(deployer.address);

    await mockAssetForwarder.handleMessage(
      NATIVE_TOKEN,
      amount,
      data,
      ankrStakeAvaxAdapter.address,
      { value: amount }
    );

    const balAfter = await ethers.provider.getBalance(deployer.address);
    const ankrEthBalAfter = await ankrEth.balanceOf(deployer.address);

    expect(balAfter).lt(balBefore);
    expect(ankrEthBalAfter).gt(ankrEthBalBefore);
  });
});
