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
import { MetaPoolStakeEth__factory } from "../../typechain/factories/MetaPoolStakeEth__factory";
import { TokenInterface__factory } from "../../typechain/factories/TokenInterface__factory";
import { MockAssetForwarder__factory } from "../../typechain/factories/MockAssetForwarder__factory";
import { BatchTransaction__factory } from "../../typechain/factories/BatchTransaction__factory";
import { BigNumber, Contract, Wallet } from "ethers";
import { getPathfinderData } from "../utils";
import { defaultAbiCoder } from "ethers/lib/utils";
import { DexSpanAdapter__factory } from "../../typechain/factories/DexSpanAdapter__factory";

const CHAIN_ID = "5";
const MPETH_TOKEN = "0x748c905130CC15b92B97084Fd1eEBc2d2419146f";
const METAPOOL_POOL = "0x748c905130CC15b92B97084Fd1eEBc2d2419146f";
const NATIVE_TOKEN = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const USDT = "0x2227E4764be4c858E534405019488D9E5890Ff9E";

describe("MetaPoolStakeEth Adapter: ", async () => {
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

    const MetaPoolStakeEth = await ethers.getContractFactory("MetaPoolStakeEth");
    const metaPoolStakeEthAdapter = await MetaPoolStakeEth.deploy(
      NATIVE,
      WNATIVE[env][CHAIN_ID],
      deployer.address,
      mockAssetForwarder.address,
      DEXSPAN[env][CHAIN_ID],
      MPETH_TOKEN,
      METAPOOL_POOL
    );

    return {
      batchTransaction: BatchTransaction__factory.connect(
        batchTransaction.address,
        deployer
      ),
      metaPoolStakeEthAdapter: MetaPoolStakeEth__factory.connect(
        metaPoolStakeEthAdapter.address,
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
      mpEth: TokenInterface__factory.connect(MPETH_TOKEN, deployer),
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

  it("Can stake on metaPool on same chain", async () => {
    const { batchTransaction, metaPoolStakeEthAdapter, mpEth } =
      await setupTests();

    const amount = ethers.utils.parseEther("1");

    const metaPoolData = defaultAbiCoder.encode(
      ["address", "uint256"],
      [deployer.address, amount]
    );

    const tokens = [NATIVE_TOKEN];
    const amounts = [amount];
    const targets = [metaPoolStakeEthAdapter.address];
    const data = [metaPoolData];
    const value = [0];
    const callType = [2];

    const balBefore = await ethers.provider.getBalance(deployer.address);
    const mpEthBalBefore = await mpEth.balanceOf(deployer.address);

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
    const mpEthBalAfter = await mpEth.balanceOf(deployer.address);

    expect(balBefore).gt(balAfter);
    expect(mpEthBalAfter).gt(mpEthBalBefore);
  });

  it("Can swap on dexspan and stake on metaPool on same chain", async () => {
    // This may fail because the path finder may not give good estimate of minReturn
    // due to which it may be lower than min amount to stake on metaPool

    const {
      batchTransaction,
      dexSpanAdapter,
      metaPoolStakeEthAdapter,
      mpEth,
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

    const metaPoolData = defaultAbiCoder.encode(
      ["address", "uint256"],
      [deployer.address, minReturn]
    );

    const tokens = [usdt.address];
    const amounts = [dexSpanAmount];
    const targets = [dexSpanAdapter.address, metaPoolStakeEthAdapter.address];
    const data = [swapData, metaPoolData];
    const value = [0, 0];
    const callType = [2, 2];

    const usdtBalBefore = await usdt.balanceOf(deployer.address);
    const mpEthBalBefore = await mpEth.balanceOf(deployer.address);

    await batchTransaction.executeBatchCallsSameChain(
      tokens,
      amounts,
      targets,
      value,
      callType,
      data
    );

    const usdtBalAfter = await usdt.balanceOf(deployer.address);
    const mpEthBalAfter = await mpEth.balanceOf(deployer.address);

    expect(usdtBalBefore).gt(usdtBalAfter);
    expect(mpEthBalAfter).gt(mpEthBalBefore);
  });

  it("Can stake ETH on MetaPool on dest chain when instruction is received from BatchTransaction contract", async () => {
    const {
      batchTransaction,
      metaPoolStakeEthAdapter,
      mpEth,
      mockAssetForwarder,
    } = await setupTests();

    const amount = "100000000000000000";

    const targets = [metaPoolStakeEthAdapter.address];
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
    const mpEthBalBefore = await mpEth.balanceOf(deployer.address);

    await mockAssetForwarder.handleMessage(
      NATIVE_TOKEN,
      amount,
      assetForwarderData,
      batchTransaction.address,
      { value: amount }
    );

    const balAfter = await ethers.provider.getBalance(deployer.address);
    const mpEthBalAfter = await mpEth.balanceOf(deployer.address);

    expect(balAfter).lt(balBefore);
    expect(mpEthBalAfter).gt(mpEthBalBefore);
  });

  it("Can stake ETH on MetaPool on dest chain when instruction is received directly on MetaPoolStakeEth adapter", async () => {
    const { metaPoolStakeEthAdapter, mpEth, mockAssetForwarder } =
      await setupTests();

    const amount = "100000000000000000";

    const data = defaultAbiCoder.encode(["address"], [deployer.address]);

    const balBefore = await ethers.provider.getBalance(deployer.address);
    const mpEthBalBefore = await mpEth.balanceOf(deployer.address);

    await mockAssetForwarder.handleMessage(
      NATIVE_TOKEN,
      amount,
      data,
      metaPoolStakeEthAdapter.address,
      { value: amount }
    );

    const balAfter = await ethers.provider.getBalance(deployer.address);
    const mpEthBalAfter = await mpEth.balanceOf(deployer.address);

    expect(balAfter).lt(balBefore);
    expect(mpEthBalAfter).gt(mpEthBalBefore);
  });
});
