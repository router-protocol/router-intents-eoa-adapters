import hardhat, { ethers, waffle } from "hardhat";
import { expect } from "chai";
import { RPC } from "../constants";
import { DEXSPAN, DEFAULT_ENV, NATIVE, WNATIVE,FEE_WALLET } from "../../tasks/constants";
import { SharedStakeEth__factory } from "../../typechain/factories/SharedStakeEth__factory";
import { TokenInterface__factory } from "../../typechain/factories/TokenInterface__factory";
import { MockAssetForwarder__factory } from "../../typechain/factories/MockAssetForwarder__factory";
import { BatchTransaction__factory } from "../../typechain/factories/BatchTransaction__factory";
import { defaultAbiCoder } from "ethers/lib/utils";
import { DexSpanAdapter__factory } from "../../typechain/factories/DexSpanAdapter__factory";
import { zeroAddress } from "ethereumjs-util";
import { ChainId } from "@uniswap/sdk-core";

const CHAIN_ID = "1";
const SHARED_STAKE_WSGETH = "0x31AA035313b1D2109e61Ee0E3662A86A8615fF1d";
const SHARED_STAKE_DEPOSIT_MINTER =
  "0x85Bc06f4e3439d41f610a440Ba0FbE333736B310";
const NATIVE_TOKEN = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";

describe("SharedStakeEth Adapter: ", async () => {
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

    const SharedStakeEth = await ethers.getContractFactory("SharedStakeEth");
    const sharedStakeEthAdapter = await SharedStakeEth.deploy(
      NATIVE,
      WNATIVE[env][CHAIN_ID],
      SHARED_STAKE_WSGETH,
      SHARED_STAKE_DEPOSIT_MINTER
    );

    await batchTransaction.setAdapterWhitelist(
      [dexSpanAdapter.address, sharedStakeEthAdapter.address],
      [true, true]
    );

    return {
      batchTransaction: BatchTransaction__factory.connect(
        batchTransaction.address,
        deployer
      ),
      sharedStakeEthAdapter: SharedStakeEth__factory.connect(
        sharedStakeEthAdapter.address,
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
      wsgEth: TokenInterface__factory.connect(SHARED_STAKE_WSGETH, deployer),
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

  it("Can stake on sharedStake on same chain", async () => {
    const { batchTransaction, sharedStakeEthAdapter, wsgEth } =
      await setupTests();

    const amount = ethers.utils.parseEther("1");

    const sharedStakeData = defaultAbiCoder.encode(
      ["address", "uint256"],
      [deployer.address, amount]
    );

    const tokens = [NATIVE_TOKEN];
    const amounts = [amount];
    const targets = [sharedStakeEthAdapter.address];
    const data = [sharedStakeData];
    const value = [0];
    const callType = [2];
    // const feeInfo = [{ fee: 0, recipient: zeroAddress() }];

    const balBefore = await ethers.provider.getBalance(deployer.address);
    const wsgEthBalBefore = await wsgEth.balanceOf(deployer.address);

    await batchTransaction.executeBatchCallsSameChain(
      0,
      tokens,
      amounts,
      "",
      targets,
      value,
      callType,
      data,
      { value: amount, gasLimit: 10000000 }
    );

    const balAfter = await ethers.provider.getBalance(deployer.address);
    const wsgEthBalAfter = await wsgEth.balanceOf(deployer.address);

    expect(balBefore).gt(balAfter);
    expect(wsgEthBalAfter).gt(wsgEthBalBefore);
  });

  it("Can stake ETH on SharedStake on dest chain when instruction is received from BatchTransaction contract", async () => {
    const {
      batchTransaction,
      sharedStakeEthAdapter,
      wsgEth,
      mockAssetForwarder,
    } = await setupTests();

    const amount = "100000000000000000";

    const targets = [sharedStakeEthAdapter.address];
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

    const balBefore = await ethers.provider.getBalance(deployer.address);
    const wsgEthBalBefore = await wsgEth.balanceOf(deployer.address);

    await mockAssetForwarder.handleMessage(
      NATIVE_TOKEN,
      amount,
      assetForwarderData,
      batchTransaction.address,
      { value: amount, gasLimit: 10000000 }
    );

    const balAfter = await ethers.provider.getBalance(deployer.address);
    const wsgEthBalAfter = await wsgEth.balanceOf(deployer.address);

    expect(balAfter).lt(balBefore);
    expect(wsgEthBalAfter).gt(wsgEthBalBefore);
  });
});
