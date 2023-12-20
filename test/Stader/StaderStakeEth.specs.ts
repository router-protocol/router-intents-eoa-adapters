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
import { StaderStakeEth__factory } from "../../typechain/factories/StaderStakeEth__factory";
import { TokenInterface__factory } from "../../typechain/factories/TokenInterface__factory";
import { MockAssetForwarder__factory } from "../../typechain/factories/MockAssetForwarder__factory";
import { BatchTransaction__factory } from "../../typechain/factories/BatchTransaction__factory";
import { BigNumber, Contract, Wallet } from "ethers";
import { getPathfinderData } from "../utils";
import { defaultAbiCoder } from "ethers/lib/utils";
import { DexSpanAdapter__factory } from "../../typechain/factories/DexSpanAdapter__factory";

const CHAIN_ID = "5";
const STADER_X_TOKEN = "0x3338eCd3ab3d3503c55c931d759fA6d78d287236";
const STADER_POOL = "0xd0e400Ec6Ed9C803A9D9D3a602494393E806F823";
const NATIVE_TOKEN = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const USDT = "0x2227E4764be4c858E534405019488D9E5890Ff9E";

describe("StaderStakeEth Adapter: ", async () => {
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

    const StaderStakeEth = await ethers.getContractFactory("StaderStakeEth");
    const staderStakeEthAdapter = await StaderStakeEth.deploy(
      NATIVE,
      WNATIVE[env][CHAIN_ID],
      deployer.address,
      mockAssetForwarder.address,
      DEXSPAN[env][CHAIN_ID],
      STADER_X_TOKEN,
      STADER_POOL
    );

    return {
      batchTransaction: BatchTransaction__factory.connect(
        batchTransaction.address,
        deployer
      ),
      staderStakeEthAdapter: StaderStakeEth__factory.connect(
        staderStakeEthAdapter.address,
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
      ethx: TokenInterface__factory.connect(STADER_X_TOKEN, deployer),
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

  it("Can stake on stader on same chain", async () => {
    const { batchTransaction, staderStakeEthAdapter, ethx } =
      await setupTests();

    const amount = ethers.utils.parseEther("1");

    const staderData = defaultAbiCoder.encode(
      ["address", "uint256"],
      [deployer.address, amount]
    );

    const tokens = [NATIVE_TOKEN];
    const amounts = [amount];
    const targets = [staderStakeEthAdapter.address];
    const data = [staderData];
    const value = [0];
    const callType = [2];

    const balBefore = await ethers.provider.getBalance(deployer.address);
    const ethxBalBefore = await ethx.balanceOf(deployer.address);

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
    const ethxBalAfter = await ethx.balanceOf(deployer.address);

    expect(balBefore).gt(balAfter);
    expect(ethxBalAfter).gt(ethxBalBefore);
  });

  it("Can swap on dexspan and stake on stader on same chain", async () => {
    // This may fail because the path finder may not give good estimate of minReturn
    // due to which it may be lower than min amount to stake on stader

    const {
      batchTransaction,
      dexSpanAdapter,
      staderStakeEthAdapter,
      ethx,
      usdt,
    } = await setupTests();

    await setUserTokenBalance(usdt, deployer, BigNumber.from("10000000000000"));

    const dexSpanAmount = "10000000000000";
    await usdt.approve(batchTransaction.address, dexSpanAmount);

    const { data: swapData, minReturn } = await getPathfinderData(
      usdt.address,
      NATIVE_TOKEN,
      dexSpanAmount,
      CHAIN_ID,
      CHAIN_ID,
      batchTransaction.address
    );

    const staderData = defaultAbiCoder.encode(
      ["address", "uint256"],
      [deployer.address, minReturn]
    );

    const tokens = [usdt.address];
    const amounts = [dexSpanAmount];
    const targets = [dexSpanAdapter.address, staderStakeEthAdapter.address];
    const data = [swapData, staderData];
    const value = [0, 0];
    const callType = [2, 2];

    const usdtBalBefore = await usdt.balanceOf(deployer.address);
    const ethxBalBefore = await ethx.balanceOf(deployer.address);

    await batchTransaction.executeBatchCallsSameChain(
      tokens,
      amounts,
      targets,
      value,
      callType,
      data
    );

    const usdtBalAfter = await usdt.balanceOf(deployer.address);
    const ethxBalAfter = await ethx.balanceOf(deployer.address);

    expect(usdtBalBefore).gt(usdtBalAfter);
    expect(ethxBalAfter).gt(ethxBalBefore);
  });

  it("Can stake ETH on Stader on dest chain when instruction is received from BatchTransaction contract", async () => {
    const {
      batchTransaction,
      staderStakeEthAdapter,
      ethx,
      mockAssetForwarder,
    } = await setupTests();

    const amount = "100000000000000000";

    const targets = [staderStakeEthAdapter.address];
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
    const ethxBalBefore = await ethx.balanceOf(deployer.address);

    await mockAssetForwarder.handleMessage(
      NATIVE_TOKEN,
      amount,
      assetForwarderData,
      batchTransaction.address,
      { value: amount }
    );

    const balAfter = await ethers.provider.getBalance(deployer.address);
    const ethxBalAfter = await ethx.balanceOf(deployer.address);

    expect(balAfter).lt(balBefore);
    expect(ethxBalAfter).gt(ethxBalBefore);
  });

  it("Can stake ETH on Stader on dest chain when instruction is received directly on StaderStakeEth adapter", async () => {
    const { staderStakeEthAdapter, ethx, mockAssetForwarder } =
      await setupTests();

    const amount = "100000000000000000";

    const data = defaultAbiCoder.encode(["address"], [deployer.address]);

    const balBefore = await ethers.provider.getBalance(deployer.address);
    const ethxBalBefore = await ethx.balanceOf(deployer.address);

    await mockAssetForwarder.handleMessage(
      NATIVE_TOKEN,
      amount,
      data,
      staderStakeEthAdapter.address,
      { value: amount }
    );

    const balAfter = await ethers.provider.getBalance(deployer.address);
    const ethxBalAfter = await ethx.balanceOf(deployer.address);

    expect(balAfter).lt(balBefore);
    expect(ethxBalAfter).gt(ethxBalBefore);
  });
});
