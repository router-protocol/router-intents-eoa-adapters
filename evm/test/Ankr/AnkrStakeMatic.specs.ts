import hardhat, { ethers, waffle } from "hardhat";
import { expect } from "chai";
import { RPC } from "../constants";
import { DEXSPAN, DEFAULT_ENV, NATIVE, WNATIVE } from "../../tasks/constants";
import { AnkrStakeMatic__factory } from "../../typechain/factories/AnkrStakeMatic__factory";
import { TokenInterface__factory } from "../../typechain/factories/TokenInterface__factory";
import { MockAssetForwarder__factory } from "../../typechain/factories/MockAssetForwarder__factory";
import { BatchTransaction__factory } from "../../typechain/factories/BatchTransaction__factory";
import { BigNumber, Contract, Wallet } from "ethers";
import { defaultAbiCoder } from "ethers/lib/utils";
import { DexSpanAdapter__factory } from "../../typechain/factories/DexSpanAdapter__factory";

const CHAIN_ID = "1";
const ANKR_TOKEN = "0x26dcFbFa8Bc267b250432c01C982Eaf81cC5480C";
const ANKR_POOL = "0xCfD4B4Bc15C8bF0Fd820B0D4558c725727B3ce89";
const USDT = "0xdac17f958d2ee523a2206206994597c13d831ec7";
const MATIC_TOKEN = "0x7D1AfA7B718fb893dB30A3aBc0Cfc608AaCfeBB0";

describe("AnkrStakeMatic Adapter: ", async () => {
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

    const AnkrStakeMatic = await ethers.getContractFactory("AnkrStakeMatic");
    const ankrStakeMaticAdapter = await AnkrStakeMatic.deploy(
      NATIVE,
      WNATIVE[env][CHAIN_ID],
      ANKR_TOKEN,
      MATIC_TOKEN,
      ANKR_POOL
    );

    await batchTransaction.setAdapterWhitelist(
      [dexSpanAdapter.address, ankrStakeMaticAdapter.address],
      [true, true]
    );

    return {
      batchTransaction: BatchTransaction__factory.connect(
        batchTransaction.address,
        deployer
      ),
      ankrStakeMaticAdapter: AnkrStakeMatic__factory.connect(
        ankrStakeMaticAdapter.address,
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
      ankrMatic: TokenInterface__factory.connect(ANKR_TOKEN, deployer),
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

  it("Can stake on ankr on same chain", async () => {
    const { batchTransaction, ankrStakeMaticAdapter, ankrMatic, matic } =
      await setupTests();

    const amount = ethers.utils.parseEther("1");

    const ankrData = defaultAbiCoder.encode(
      ["address", "uint256"],
      [deployer.address, amount]
    );

    const tokens = [MATIC_TOKEN];
    const amounts = [amount];
    const targets = [ankrStakeMaticAdapter.address];
    const data = [ankrData];
    const value = [0];
    const callType = [2];

    await setUserTokenBalance(matic, deployer, amount);
    await matic.approve(batchTransaction.address, amount);

    const balBefore = await ethers.provider.getBalance(deployer.address);
    const ankrMaticBalBefore = await ankrMatic.balanceOf(deployer.address);

    await batchTransaction.executeBatchCallsSameChain(
      0,
      tokens,
      amounts,
      targets,
      value,
      callType,
      data
    );

    const balAfter = await ethers.provider.getBalance(deployer.address);
    const ankrMaticBalAfter = await ankrMatic.balanceOf(deployer.address);

    expect(balBefore).gt(balAfter);
    expect(ankrMaticBalAfter).gt(ankrMaticBalBefore);
  });

  it("Can stake MATIC on Ankr on dest chain when instruction is received from BatchTransaction contract", async () => {
    const {
      batchTransaction,
      ankrStakeMaticAdapter,
      ankrMatic,
      mockAssetForwarder,
      matic,
    } = await setupTests();

    const amount = ethers.utils.parseEther("1");

    const targets = [ankrStakeMaticAdapter.address];
    const data = [
      defaultAbiCoder.encode(
        ["address", "uint256"],
        [deployer.address, amount]
      ),
    ];
    const value = [0];
    const callType = [2];

    await setUserTokenBalance(matic, deployer, amount);
    await matic.approve(mockAssetForwarder.address, amount);

    const assetForwarderData = defaultAbiCoder.encode(
      ["uint256", "address", "address[]", "uint256[]", "uint256[]", "bytes[]"],
      [0, deployer.address, targets, value, callType, data]
    );

    const balBefore = await ethers.provider.getBalance(deployer.address);
    const ankrMaticBalBefore = await ankrMatic.balanceOf(deployer.address);

    await mockAssetForwarder.handleMessage(
      MATIC_TOKEN,
      amount,
      assetForwarderData,
      batchTransaction.address
    );

    const balAfter = await ethers.provider.getBalance(deployer.address);
    const ankrMaticBalAfter = await ankrMatic.balanceOf(deployer.address);

    expect(balAfter).lt(balBefore);
    expect(ankrMaticBalAfter).gt(ankrMaticBalBefore);
  });
});
