import hardhat, { ethers, waffle } from "hardhat";
import { expect } from "chai";
import { RPC } from "../constants";
import { DEXSPAN, DEFAULT_ENV, NATIVE, WNATIVE } from "../../tasks/constants";
import { LidoStakeMatic__factory } from "../../typechain/factories/LidoStakeMatic__factory";
import { TokenInterface__factory } from "../../typechain/factories/TokenInterface__factory";
import { MockAssetForwarder__factory } from "../../typechain/factories/MockAssetForwarder__factory";
import { BatchTransaction__factory } from "../../typechain/factories/BatchTransaction__factory";
import { BigNumber, Contract, Wallet } from "ethers";
import { defaultAbiCoder } from "ethers/lib/utils";
import { DexSpanAdapter__factory } from "../../typechain/factories/DexSpanAdapter__factory";
import { zeroAddress } from "ethereumjs-util";

const CHAIN_ID = "5";
const LIDO_ST_TOKEN = "0x9A7c69A167160C507602ecB3Df4911e8E98e1279";
const MATIC_TOKEN = "0x499d11E0b6eAC7c0593d8Fb292DCBbF815Fb29Ae";
const LIDO_REFERRAL_ADDRESS = "0x1643E812aE58766192Cf7D2Cf9567dF2C37e9B7F";
const USDT = "0x2227E4764be4c858E534405019488D9E5890Ff9E";

describe("LidoStakeMatic Adapter: ", async () => {
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
      zeroAddress(),
      zeroAddress()
    );

    const DexSpanAdapter = await ethers.getContractFactory("DexSpanAdapter");
    const dexSpanAdapter = await DexSpanAdapter.deploy(
      NATIVE,
      WNATIVE[env][CHAIN_ID],
      DEXSPAN[env][CHAIN_ID]
    );

    const LidoStakeMatic = await ethers.getContractFactory("LidoStakeMatic");
    const lidoStakeMaticAdapter = await LidoStakeMatic.deploy(
      NATIVE,
      WNATIVE[env][CHAIN_ID],
      LIDO_ST_TOKEN,
      MATIC_TOKEN,
      LIDO_REFERRAL_ADDRESS
    );

    await batchTransaction.setAdapterWhitelist(
      [dexSpanAdapter.address, lidoStakeMaticAdapter.address],
      [true, true]
    );

    return {
      batchTransaction: BatchTransaction__factory.connect(
        batchTransaction.address,
        deployer
      ),
      lidoStakeMaticAdapter: LidoStakeMatic__factory.connect(
        lidoStakeMaticAdapter.address,
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
      matic: TokenInterface__factory.connect(MATIC_TOKEN, deployer),
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

  it("Can stake on lido on same chain", async () => {
    const { batchTransaction, lidoStakeMaticAdapter, steth, matic } =
      await setupTests();

    const amount = ethers.utils.parseEther("1");

    const lidoData = defaultAbiCoder.encode(
      ["address", "uint256"],
      [deployer.address, amount]
    );

    const tokens = [MATIC_TOKEN];
    const amounts = [amount];
    const targets = [lidoStakeMaticAdapter.address];
    const data = [lidoData];
    const value = [0];
    const callType = [2];
    // const feeInfo = [{ fee: 0, recipient: zeroAddress() }];

    await setUserTokenBalance(matic, deployer, amount);
    await matic.approve(batchTransaction.address, amount);

    const balBefore = await ethers.provider.getBalance(deployer.address);
    const stethBalBefore = await steth.balanceOf(deployer.address);

    await batchTransaction.executeBatchCallsSameChain(
      0,
      tokens,
      amounts,
      "",
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
    const {
      batchTransaction,
      lidoStakeMaticAdapter,
      steth,
      mockAssetForwarder,
      matic,
    } = await setupTests();

    const amount = ethers.utils.parseEther("1");

    const targets = [lidoStakeMaticAdapter.address];
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

    await setUserTokenBalance(matic, deployer, amount);
    await matic.approve(mockAssetForwarder.address, amount);

    const balBefore = await ethers.provider.getBalance(deployer.address);
    const stethBalBefore = await steth.balanceOf(deployer.address);

    await mockAssetForwarder.handleMessage(
      MATIC_TOKEN,
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
