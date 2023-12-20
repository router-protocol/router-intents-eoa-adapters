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
import { RPStakeEth__factory } from "../../typechain/factories/RPStakeEth__factory";
import { TokenInterface__factory } from "../../typechain/factories/TokenInterface__factory";
import { MockAssetForwarder__factory } from "../../typechain/factories/MockAssetForwarder__factory";
import { BatchTransaction__factory } from "../../typechain/factories/BatchTransaction__factory";
import { BigNumber, Contract, Wallet } from "ethers";
import { getPathfinderData } from "../utils";
import { defaultAbiCoder } from "ethers/lib/utils";
import { DexSpanAdapter__factory } from "../../typechain/factories/DexSpanAdapter__factory";

const CHAIN_ID = "17000";
const R_ETH_TOKEN = "0x7322c24752f79c05FFD1E2a6FCB97020C1C264F1";
const ROCKET_DEPOSIT_POOL = "0x320f3aAB9405e38b955178BBe75c477dECBA0C27";
const NATIVE_TOKEN = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const USDT = "0x2227E4764be4c858E534405019488D9E5890Ff9E";

describe("RPStakeEth Adapter: ", async () => {
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

    const RPStakeEth = await ethers.getContractFactory("RPStakeEth");
    const rpStakeEthAdapter = await RPStakeEth.deploy(
      NATIVE,
      WNATIVE[env][CHAIN_ID],
      deployer.address,
      mockAssetForwarder.address,
      DEXSPAN[env][CHAIN_ID],
      R_ETH_TOKEN,
      ROCKET_DEPOSIT_POOL
    );

    return {
      batchTransaction: BatchTransaction__factory.connect(
        batchTransaction.address,
        deployer
      ),
      rpStakeEthAdapter: RPStakeEth__factory.connect(
        rpStakeEthAdapter.address,
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
      rpEth: TokenInterface__factory.connect(R_ETH_TOKEN, deployer),
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

  it.only("Can stake on rp on same chain", async () => {
    const { batchTransaction, rpStakeEthAdapter, rpEth } =
      await setupTests();

    const amount = ethers.utils.parseEther("1");

    const rpData = defaultAbiCoder.encode(
      ["address", "uint256"],
      [deployer.address, amount]
    );

    const tokens = [NATIVE_TOKEN];
    const amounts = [amount];
    const targets = [rpStakeEthAdapter.address];
    const data = [rpData];
    const value = [0];
    const callType = [2];

    const balBefore = await ethers.provider.getBalance(deployer.address);
    const rpEthBalBefore = await rpEth.balanceOf(deployer.address);

    await batchTransaction.executeBatchCallsSameChain(
      tokens,
      amounts,
      targets,
      value,
      callType,
      data,
      { value: amount,
        gasLimit: 10000000 }
    );

    const balAfter = await ethers.provider.getBalance(deployer.address);
    const rpEthBalAfter = await rpEth.balanceOf(deployer.address);

    expect(balBefore).gt(balAfter);
    expect(rpEthBalAfter).gt(rpEthBalBefore);
  });

  it("Can stake ETH on Rocket Pool on dest chain when instruction is received from BatchTransaction contract", async () => {
    const {
      batchTransaction,
      rpStakeEthAdapter,
      rpEth,
      mockAssetForwarder,
    } = await setupTests();

    const amount = "100000000000000000";

    const targets = [rpStakeEthAdapter.address];
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
    const rpEthBalBefore = await rpEth.balanceOf(deployer.address);

    await mockAssetForwarder.handleMessage(
      NATIVE_TOKEN,
      amount,
      assetForwarderData,
      batchTransaction.address,
      { value: amount }
    );

    const balAfter = await ethers.provider.getBalance(deployer.address);
    const rpEthBalAfter = await rpEth.balanceOf(deployer.address);

    expect(balAfter).lt(balBefore);
    expect(rpEthBalAfter).gt(rpEthBalBefore);
  });

  it("Can stake ETH on Rocket Pool on dest chain when instruction is received directly on RPStakeEth adapter", async () => {
    const { rpStakeEthAdapter, rpEth, mockAssetForwarder } =
      await setupTests();

    const amount = "100000000000000000";

    const data = defaultAbiCoder.encode(["address"], [deployer.address]);

    const balBefore = await ethers.provider.getBalance(deployer.address);
    const rpEthBalBefore = await rpEth.balanceOf(deployer.address);

    await mockAssetForwarder.handleMessage(
      NATIVE_TOKEN,
      amount,
      data,
      rpStakeEthAdapter.address,
      { value: amount }
    );

    const balAfter = await ethers.provider.getBalance(deployer.address);
    const rpEthBalAfter = await rpEth.balanceOf(deployer.address);

    expect(balAfter).lt(balBefore);
    expect(rpEthBalAfter).gt(rpEthBalBefore);
  });
});
