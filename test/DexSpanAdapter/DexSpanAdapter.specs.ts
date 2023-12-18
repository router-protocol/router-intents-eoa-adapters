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
import { DexSpanAdapter__factory } from "../../typechain/factories/DexSpanAdapter__factory";
import { TokenInterface__factory } from "../../typechain/factories/TokenInterface__factory";
import { MockAssetForwarder__factory } from "../../typechain/factories/MockAssetForwarder__factory";
import { BatchTransaction__factory } from "../../typechain/factories/BatchTransaction__factory";
import { BigNumber, Contract, Wallet } from "ethers";
import { decodeUnsupportedOperationEvent, getPathfinderData } from "../utils";
import { defaultAbiCoder } from "ethers/lib/utils";

const CHAIN_ID = "80001";
const NATIVE_TOKEN = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const USDT = "0x22bAA8b6cdd31a0C5D1035d6e72043f4Ce6aF054";

describe("DexSpan Adapter: ", async () => {
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
      mockAssetForwarder.address,
      DEXSPAN[env][CHAIN_ID],
      DEFAULT_REFUND_ADDRESS,
      deployer.address
    );

    return {
      batchTransaction: BatchTransaction__factory.connect(
        batchTransaction.address,
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

  it("Can swap using dexspan on same chain", async () => {
    const { batchTransaction, dexSpanAdapter, usdt } = await setupTests();

    await setUserTokenBalance(usdt, deployer, ethers.utils.parseEther("1"));

    const amount = "10000000000000";
    await usdt.approve(batchTransaction.address, amount);

    const { data: swapData } = await getPathfinderData(
      usdt.address,
      NATIVE_TOKEN,
      amount,
      CHAIN_ID,
      CHAIN_ID,
      deployer.address
    );

    const tokens = [usdt.address];
    const amounts = [amount];
    const targets = [dexSpanAdapter.address];
    const data = [swapData];
    const value = [0];
    const callType = [2];

    const balBefore = await ethers.provider.getBalance(deployer.address);

    await batchTransaction.executeBatchCallsSameChain(
      tokens,
      amounts,
      targets,
      value,
      callType,
      data
    );

    const balAfter = await ethers.provider.getBalance(deployer.address);

    expect(balAfter).gt(balBefore);
  });

  it("Can swap using dexspan on dest chain when instruction is received from BatchTransaction contract", async () => {
    const { batchTransaction, dexSpanAdapter, usdt, mockAssetForwarder } =
      await setupTests();

    await setUserTokenBalance(usdt, deployer, ethers.utils.parseEther("1"));

    const amount = "10000000000000";
    await usdt.approve(mockAssetForwarder.address, amount);

    const { data: swapData } = await getPathfinderData(
      usdt.address,
      NATIVE_TOKEN,
      amount,
      CHAIN_ID,
      CHAIN_ID,
      deployer.address
    );

    const targets = [dexSpanAdapter.address];
    const data = [swapData];
    const value = [0];
    const callType = [2];

    const assetForwarderData = defaultAbiCoder.encode(
      ["address", "address[]", "uint256[]", "uint256[]", "bytes[]"],
      [deployer.address, targets, value, callType, data]
    );

    const balBefore = await ethers.provider.getBalance(deployer.address);

    await mockAssetForwarder.handleMessage(
      usdt.address,
      amount,
      assetForwarderData,
      batchTransaction.address
    );

    const balAfter = await ethers.provider.getBalance(deployer.address);

    expect(balAfter).gt(balBefore);
  });

  it("Cannot swap using dexspan on dest chain when instruction is received directly on dexspan adapter", async () => {
    const { dexSpanAdapter, usdt, mockAssetForwarder } = await setupTests();

    await setUserTokenBalance(usdt, deployer, ethers.utils.parseEther("1"));

    const amount = "10000000000000";
    await usdt.approve(mockAssetForwarder.address, amount);

    const { data: swapData } = await getPathfinderData(
      usdt.address,
      NATIVE_TOKEN,
      amount,
      CHAIN_ID,
      CHAIN_ID,
      deployer.address
    );

    const tx = await mockAssetForwarder.handleMessage(
      usdt.address,
      amount,
      swapData,
      dexSpanAdapter.address
    );

    const txReceipt = await tx.wait();

    const { token, refundAddress, refundAmount } =
      decodeUnsupportedOperationEvent(txReceipt);

    expect(token).eq(usdt.address);
    expect(refundAddress).eq(DEFAULT_REFUND_ADDRESS);
    expect(refundAmount).eq(amount);
  });
});
