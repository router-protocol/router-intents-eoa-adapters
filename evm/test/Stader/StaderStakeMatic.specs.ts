import hardhat, { ethers, waffle } from "hardhat";
import { expect } from "chai";
import { RPC } from "../constants";
import { DEXSPAN, DEFAULT_ENV, WNATIVE } from "../../tasks/constants";
import { StaderStakeMatic__factory } from "../../typechain/factories/StaderStakeMatic__factory";
import { TokenInterface__factory } from "../../typechain/factories/TokenInterface__factory";
import { MockAssetForwarder__factory } from "../../typechain/factories/MockAssetForwarder__factory";
import { BatchTransaction__factory } from "../../typechain/factories/BatchTransaction__factory";
import { BigNumber, Contract, Wallet } from "ethers";
import { defaultAbiCoder } from "ethers/lib/utils";
import { zeroAddress } from "ethereumjs-util";

const CHAIN_ID = "1";
const STADER_X_TOKEN = "0xf03A7Eb46d01d9EcAA104558C732Cf82f6B6B645";
const NATIVE_TOKEN = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const MATIC_TOKEN = "0x7D1AfA7B718fb893dB30A3aBc0Cfc608AaCfeBB0";
const USDT = "0xdac17f958d2ee523a2206206994597c13d831ec7";

describe("StaderStakeMatic Adapter: ", async () => {
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
      NATIVE_TOKEN,
      WNATIVE[env][CHAIN_ID],
      mockAssetForwarder.address,
      DEXSPAN[env][CHAIN_ID],
      zeroAddress()
    );

    const StaderStakeMatic = await ethers.getContractFactory(
      "StaderStakeMatic"
    );
    const staderStakeMaticAdapter = await StaderStakeMatic.deploy(
      NATIVE_TOKEN,
      WNATIVE[env][CHAIN_ID],
      STADER_X_TOKEN,
      MATIC_TOKEN
    );

    await batchTransaction.setAdapterWhitelist(
      [staderStakeMaticAdapter.address],
      [true]
    );

    return {
      batchTransaction: BatchTransaction__factory.connect(
        batchTransaction.address,
        deployer
      ),
      staderStakeMaticAdapter: StaderStakeMatic__factory.connect(
        staderStakeMaticAdapter.address,
        deployer
      ),
      mockAssetForwarder: MockAssetForwarder__factory.connect(
        mockAssetForwarder.address,
        deployer
      ),
      usdt: TokenInterface__factory.connect(USDT, deployer),
      maticx: TokenInterface__factory.connect(STADER_X_TOKEN, deployer),
      matic: TokenInterface__factory.connect(MATIC_TOKEN, deployer),
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
    const { batchTransaction, staderStakeMaticAdapter, maticx, matic } =
      await setupTests();

    const amount = ethers.utils.parseEther("1");

    const staderData = defaultAbiCoder.encode(
      ["address", "uint256"],
      [deployer.address, amount]
    );

    await setUserTokenBalance(matic, deployer, amount);
    await matic.approve(batchTransaction.address, amount);

    const tokens = [MATIC_TOKEN];
    const amounts = [amount];
    const targets = [staderStakeMaticAdapter.address];
    const data = [staderData];
    const value = [0];
    const callType = [2];
    const feeInfo = [{ fee: 0, recipient: zeroAddress() }];

    const maticxBalBefore = await maticx.balanceOf(deployer.address);

    await batchTransaction.executeBatchCallsSameChain(
      0,
      tokens,
      amounts,
      feeInfo,
      targets,
      value,
      callType,
      data
    );

    const maticxBalAfter = await maticx.balanceOf(deployer.address);

    expect(maticxBalAfter).gt(maticxBalBefore);
  });

  it("Can stake Matic on Stader on dest chain when instruction is received from BatchTransaction contract", async () => {
    const {
      batchTransaction,
      staderStakeMaticAdapter,
      maticx,
      mockAssetForwarder,
      matic,
    } = await setupTests();

    const amount = ethers.utils.parseEther("1");

    const targets = [staderStakeMaticAdapter.address];
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
    const maticxBalBefore = await maticx.balanceOf(deployer.address);

    await setUserTokenBalance(matic, deployer, amount);
    await matic.approve(mockAssetForwarder.address, amount);

    await mockAssetForwarder.handleMessage(
      MATIC_TOKEN,
      amount,
      assetForwarderData,
      batchTransaction.address,
      { gasLimit: 1000000 }
    );

    const maticxBalAfter = await maticx.balanceOf(deployer.address);

    expect(maticxBalAfter).gt(maticxBalBefore);
  });
});
