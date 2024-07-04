import hardhat, { ethers, waffle } from "hardhat";
import { expect } from "chai";
import { RPC } from "../constants";
import { DEXSPAN, DEFAULT_ENV, NATIVE, WNATIVE } from "../../tasks/constants";
import { PenpieStakePendle__factory } from "../../typechain/factories/PenpieStakePendle__factory";
import { TokenInterface__factory } from "../../typechain/factories/TokenInterface__factory";
import { MockAssetForwarder__factory } from "../../typechain/factories/MockAssetForwarder__factory";
import { BatchTransaction__factory } from "../../typechain/factories/BatchTransaction__factory";
import { BigNumber, Contract, Wallet } from "ethers";
import { defaultAbiCoder } from "ethers/lib/utils";
import { DexSpanAdapter__factory } from "../../typechain/factories/DexSpanAdapter__factory";
import {
  M_PENDLE_CONVERTER,
  M_PENDLE_RECEIPT_TOKEN,
  PENDLE_TOKEN,
} from "../../tasks/deploy/penpie/constants";
import { zeroAddress } from "ethereumjs-util";

const CHAIN_ID = "42161";
const UNIVERSAL_ROUTER = "0x5E325eDA8064b456f4781070C0738d849c824258";

const UNISWAP_ABI = [
  "function execute(bytes calldata commands, bytes[] calldata inputs, uint256 deadline) external payable",
];

describe("PenpieStakePendle Adapter: ", async () => {
  const [deployer] = waffle.provider.getWallets();

  const setupTests = async () => {
    let env = process.env.ENV;
    if (!env) env = DEFAULT_ENV;
    const MockAssetForwarder = await ethers.getContractFactory(
      "MockAssetForwarder"
    );
    const mockAssetForwarder = await MockAssetForwarder.deploy();

    const universalRouter = new ethers.Contract(
      UNIVERSAL_ROUTER,
      UNISWAP_ABI,
      deployer
    );

    const BatchTransaction = await ethers.getContractFactory(
      "BatchTransaction"
    );

    const batchTransaction = await BatchTransaction.deploy(
      NATIVE,
      WNATIVE[env][CHAIN_ID],
      mockAssetForwarder.address,
      DEXSPAN[env][CHAIN_ID],
      zeroAddress()
    );

    const DexSpanAdapter = await ethers.getContractFactory("DexSpanAdapter");
    const dexSpanAdapter = await DexSpanAdapter.deploy(
      NATIVE,
      WNATIVE[env][CHAIN_ID],
      DEXSPAN[env][CHAIN_ID]
    );

    const PenpieStakePendle = await ethers.getContractFactory(
      "PenpieStakePendle"
    );
    const penpieStakePendleAdapter = await PenpieStakePendle.deploy(
      NATIVE,
      WNATIVE[env][CHAIN_ID],
      PENDLE_TOKEN[CHAIN_ID],
      M_PENDLE_RECEIPT_TOKEN[CHAIN_ID],
      M_PENDLE_CONVERTER[CHAIN_ID]
    );

    await batchTransaction.setAdapterWhitelist(
      [dexSpanAdapter.address, penpieStakePendleAdapter.address],
      [true, true]
    );

    return {
      batchTransaction: BatchTransaction__factory.connect(
        batchTransaction.address,
        deployer
      ),
      penpieStakePendleAdapter: PenpieStakePendle__factory.connect(
        penpieStakePendleAdapter.address,
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
      receiptToken: TokenInterface__factory.connect(
        M_PENDLE_RECEIPT_TOKEN[CHAIN_ID],
        deployer
      ),
      pendle: TokenInterface__factory.connect(PENDLE_TOKEN[CHAIN_ID], deployer),
      universalRouter,
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

  it("Can stake on penpie on same chain", async () => {
    const {
      batchTransaction,
      penpieStakePendleAdapter,
      receiptToken,
      pendle,
      universalRouter,
    } = await setupTests();

    const amount = ethers.utils.parseEther("1");

    await universalRouter.execute(
      "0x0b000604",
      [
        "0x00000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000de0b6b3a7640000",
        "0x00000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000de0b6b3a764000000000000000000000000000000000000000000000000000001700da24972e26500000000000000000000000000000000000000000000000000000000000000a00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000002b82af49447d8a07e3bd95bd0d56f35241523fbab10001f40c880f6761f1af8d9aa9c466984b80dab9a8c9e8000000000000000000000000000000000000000000",
        "0x0000000000000000000000000c880f6761f1af8d9aa9c466984b80dab9a8c9e800000000000000000000000034ecdad9090cd133e63cf6670f3a03aa7f04fa740000000000000000000000000000000000000000000000000000000000000019",
        "0x0000000000000000000000000c880f6761f1af8d9aa9c466984b80dab9a8c9e8000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000001700da24972e265",
      ],
      ethers.constants.MaxUint256,
      { value: amount, gasLimit: 10000000 }
    );

    const pendleBalance = await pendle.balanceOf(deployer.address);
    expect(pendleBalance).gt(0);

    const penpieData = defaultAbiCoder.encode(
      ["address", "uint256"],
      [deployer.address, pendleBalance]
    );

    const tokens = [PENDLE_TOKEN[CHAIN_ID]];
    const amounts = [pendleBalance];
    const targets = [penpieStakePendleAdapter.address];
    const data = [penpieData];
    const value = [0];
    const callType = [2];
    const feeInfo = [{ fee: 0, recipient: zeroAddress() }];

    await pendle.approve(batchTransaction.address, pendleBalance);

    const balBefore = await ethers.provider.getBalance(deployer.address);
    const receiptTokenBalBefore = await receiptToken.balanceOf(
      deployer.address
    );

    await batchTransaction.executeBatchCallsSameChain(
      0,
      tokens,
      amounts,
      feeInfo,
      targets,
      value,
      callType,
      data,
      { gasLimit: 10000000 }
    );

    const balAfter = await ethers.provider.getBalance(deployer.address);
    const receiptTokenBalAfter = await receiptToken.balanceOf(deployer.address);

    expect(balBefore).gt(balAfter);
    expect(receiptTokenBalAfter).gt(receiptTokenBalBefore);
  });
});
