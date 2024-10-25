import hardhat, { ethers, waffle } from "hardhat";
import { expect } from "chai";
import { RPC } from "../constants";
import {
  DEXSPAN,
  DEFAULT_ENV,
  WNATIVE,
  FEE_WALLET,
} from "../../tasks/constants";
import { StakeStoneStakeBTC__factory } from "../../typechain/factories/StakeStoneStakeBTC__factory";
import { TokenInterface__factory } from "../../typechain/factories/TokenInterface__factory";
import { MockAssetForwarder__factory } from "../../typechain/factories/MockAssetForwarder__factory";
import { BatchTransaction__factory } from "../../typechain/factories/BatchTransaction__factory";
import { defaultAbiCoder } from "ethers/lib/utils";
import { zeroAddress } from "ethereumjs-util";
import { FeeAdapter__factory } from "../../typechain/factories/FeeAdapter__factory";
import { IWETH__factory } from "../../typechain/factories/IWETH__factory";
import { getTransaction } from "../utils";

const CHAIN_ID = "56";
const SBTC_TOKEN = "0x15469528C11E8Ace863F3F9e5a8329216e33dD7d";
const SBTC_VAULT = "0x3aa0670E24Cb122e1d5307Ed74b0c44d619aFF9b";
const SBTC_LZ_ADAPTER = "0x7122985656e38BDC0302Db86685bb972b145bD3C";
const NATIVE_TOKEN = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const BTCB = "0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c";

const LZ_CONTRACT_ABI = [
  {
    inputs: [
      {
        components: [
          { internalType: "uint32", name: "dstEid", type: "uint32" },
          { internalType: "bytes32", name: "to", type: "bytes32" },
          { internalType: "uint256", name: "amountLD", type: "uint256" },
          { internalType: "uint256", name: "minAmountLD", type: "uint256" },
          { internalType: "bytes", name: "extraOptions", type: "bytes" },
          { internalType: "bytes", name: "composeMsg", type: "bytes" },
          { internalType: "bytes", name: "oftCmd", type: "bytes" },
        ],
        internalType: "struct SendParam",
        name: "_sendParam",
        type: "tuple",
      },
      { internalType: "bool", name: "_payInLzToken", type: "bool" },
    ],
    name: "quoteSend",
    outputs: [
      {
        components: [
          { internalType: "uint256", name: "nativeFee", type: "uint256" },
          { internalType: "uint256", name: "lzTokenFee", type: "uint256" },
        ],
        internalType: "struct MessagingFee",
        name: "msgFee",
        type: "tuple",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
];

describe("StakeStone Stake BTC on BNB Adapter: ", async () => {
  const [deployer] = waffle.provider.getWallets();

  const setupTests = async () => {
    let env = process.env.ENV;
    if (!env) env = DEFAULT_ENV;
    const MockAssetForwarder = await ethers.getContractFactory(
      "MockAssetForwarder"
    );

    const mockAssetForwarder = await MockAssetForwarder.deploy();

    const FeeAdapter = await ethers.getContractFactory("FeeAdapter");
    const feeAdapter = await FeeAdapter.deploy(
      NATIVE_TOKEN,
      WNATIVE[env][CHAIN_ID],
      FEE_WALLET,
      5
    );

    const BatchTransaction = await ethers.getContractFactory(
      "BatchTransaction"
    );

    const batchTransaction = await BatchTransaction.deploy(
      NATIVE_TOKEN,
      WNATIVE[env][CHAIN_ID],
      mockAssetForwarder.address,
      DEXSPAN[env][CHAIN_ID],
      zeroAddress(),
      feeAdapter.address
    );

    const StakeStoneStakeBTC = await ethers.getContractFactory(
      "StakeStoneStakeBTC"
    );
    const stakeStoneStakeBTCEthAdapter = await StakeStoneStakeBTC.deploy(
      NATIVE_TOKEN,
      WNATIVE[env][CHAIN_ID],
      SBTC_TOKEN,
      SBTC_VAULT,
      SBTC_LZ_ADAPTER
    );

    const lzContract = await ethers.getContractAt(
      LZ_CONTRACT_ABI,
      SBTC_LZ_ADAPTER,
      deployer
    );

    await batchTransaction.setAdapterWhitelist(
      [feeAdapter.address, stakeStoneStakeBTCEthAdapter.address],
      [true, true]
    );
    const FeeDataStoreAddress = await feeAdapter.feeDataStore();

    const FeeDataStoreContract = await ethers.getContractFactory(
      "FeeDataStore"
    );
    const feeDataStoreInstance =
      FeeDataStoreContract.attach(FeeDataStoreAddress);

    await feeDataStoreInstance.updateFeeWalletForAppId(
      [1],
      ["0xBec33ce33afdAF5604CCDF2c4b575238C5FBD23d"]
    );

    return {
      batchTransaction: BatchTransaction__factory.connect(
        batchTransaction.address,
        deployer
      ),
      feeAdapter: FeeAdapter__factory.connect(feeAdapter.address, deployer),
      wnative: IWETH__factory.connect(WNATIVE[env][CHAIN_ID], deployer),
      stakeStoneStakeBTCEthAdapter: StakeStoneStakeBTC__factory.connect(
        stakeStoneStakeBTCEthAdapter.address,
        deployer
      ),
      sbtc: TokenInterface__factory.connect(SBTC_TOKEN, deployer),
      btcB: TokenInterface__factory.connect(BTCB, deployer),
      lzContract,
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

  it("Can stake on stakeStone on same chain when lz dstEid is 0", async () => {
    const { batchTransaction, stakeStoneStakeBTCEthAdapter, sbtc, btcB } =
      await setupTests();

    const txn = await getTransaction({
      fromTokenAddress: NATIVE_TOKEN,
      toTokenAddress: BTCB,
      amount: ethers.utils.parseEther("200").toString(),
      fromTokenChainId: CHAIN_ID,
      toTokenChainId: CHAIN_ID,
      senderAddress: deployer.address,
      receiverAddress: deployer.address,
    });

    await deployer.sendTransaction({
      to: txn.to,
      value: txn.value,
      data: txn.data,
    });

    const btcBBalBefore = await btcB.balanceOf(deployer.address);

    expect(btcBBalBefore).gt(0);

    const dstEid = "0";
    const nativeFee = "0";
    const refundAddress = deployer.address;
    const crossChainData = defaultAbiCoder.encode(
      ["uint256", "uint256", "address"],
      [nativeFee, "0", refundAddress]
    );

    const unit256Max = ethers.BigNumber.from(
      "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"
    );

    const stakeStoneData = defaultAbiCoder.encode(
      ["address", "address", "uint256", "uint32", "bytes"],
      [btcB.address, deployer.address, unit256Max, dstEid, crossChainData]
    );

    const tokens = [BTCB];
    const amounts = [btcBBalBefore];
    const targets = [stakeStoneStakeBTCEthAdapter.address];
    const data = [stakeStoneData];
    const value = [0];
    const callType = [2];
    const sbtcBalBefore = await sbtc.balanceOf(deployer.address);

    const fee = ["0"];
    const feeData = defaultAbiCoder.encode(
      ["uint256[]", "uint96[]", "address[]", "uint256[]", "bool"],
      [["1"], fee, tokens, amounts, true]
    );

    await btcB.approve(batchTransaction.address, btcBBalBefore);

    await batchTransaction.executeBatchCallsSameChain(
      0,
      tokens,
      amounts,
      feeData,
      targets,
      value,
      callType,
      data,
      { gasLimit: 10000000 }
    );

    const btcBbalAfter = await btcB.balanceOf(deployer.address);
    const sbtcBalAfter = await sbtc.balanceOf(deployer.address);

    expect(btcBBalBefore).gt(btcBbalAfter);
    expect(sbtcBalAfter).gt(sbtcBalBefore);
  });

  it("Can stake on stakeStone on same chain when lz dstEid is not zero", async () => {
    const {
      batchTransaction,
      stakeStoneStakeBTCEthAdapter,
      sbtc,
      lzContract,
      btcB,
    } = await setupTests();

    const txn = await getTransaction({
      fromTokenAddress: NATIVE_TOKEN,
      toTokenAddress: BTCB,
      amount: ethers.utils.parseEther("200").toString(),
      fromTokenChainId: CHAIN_ID,
      toTokenChainId: CHAIN_ID,
      senderAddress: deployer.address,
      receiverAddress: deployer.address,
    });

    await deployer.sendTransaction({
      to: txn.to,
      value: txn.value,
      data: txn.data,
    });

    const btcBBalBefore = await btcB.balanceOf(deployer.address);

    expect(btcBBalBefore).gt(0);
    const dstEid = "30101";

    const fee = await lzContract.quoteSend(
      {
        dstEid: dstEid,
        to: ethers.utils.hexZeroPad(deployer.address, 32),
        amountLD: btcBBalBefore.toString(),
        minAmountLD: "0",
        extraOptions: "0x",
        composeMsg: "0x",
        oftCmd: "0x",
      },
      false
    );

    const refundAddress = deployer.address;
    const crossChainData = defaultAbiCoder.encode(
      ["uint256", "uint256", "address"],
      [fee[0].toString(), "0", refundAddress]
    );

    const unit256Max = ethers.BigNumber.from(
      "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"
    );

    const stakeStoneData = defaultAbiCoder.encode(
      ["address", "address", "uint256", "uint32", "bytes"],
      [btcB.address, deployer.address, unit256Max, dstEid, crossChainData]
    );

    const tokens = [BTCB];
    const amounts = [btcBBalBefore];
    const targets = [stakeStoneStakeBTCEthAdapter.address];
    const data = [stakeStoneData];
    const value = [0];
    const callType = [2];
    const sbtcBalBefore = await sbtc.balanceOf(deployer.address);

    const feeData = defaultAbiCoder.encode(
      ["uint256[]", "uint96[]", "address[]", "uint256[]", "bool"],
      [["1"], ["0"], tokens, amounts, true]
    );

    await btcB.approve(batchTransaction.address, btcBBalBefore);

    await batchTransaction.executeBatchCallsSameChain(
      0,
      tokens,
      amounts,
      feeData,
      targets,
      value,
      callType,
      data,
      { value: fee[0].toString(), gasLimit: 10000000 }
    );
    const sbtcBalAfter = await sbtc.balanceOf(deployer.address);
    expect(sbtcBalAfter.sub(sbtcBalBefore)).lt(10 ** 13);
  });
});
