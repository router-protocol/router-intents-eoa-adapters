import hardhat, { ethers, waffle } from "hardhat";
import { expect } from "chai";
import { RPC } from "../constants";
import {
  DEXSPAN,
  DEFAULT_ENV,
  WNATIVE,
  FEE_WALLET,
} from "../../tasks/constants";
import { StakeStoneStakeBTCEth__factory } from "../../typechain/factories/StakeStoneStakeBTCEth__factory";
import { TokenInterface__factory } from "../../typechain/factories/TokenInterface__factory";
import { MockAssetForwarder__factory } from "../../typechain/factories/MockAssetForwarder__factory";
import { BatchTransaction__factory } from "../../typechain/factories/BatchTransaction__factory";
import { defaultAbiCoder } from "ethers/lib/utils";
import { zeroAddress } from "ethereumjs-util";
import { FeeAdapter__factory } from "../../typechain/factories/FeeAdapter__factory";
import { IWETH__factory } from "../../typechain/factories/IWETH__factory";
import { getTransaction } from "../utils";

const CHAIN_ID = "1";
const SBTC_TOKEN = "0x094c0e36210634c3CfA25DC11B96b562E0b07624";
const SBTC_VAULT = "0x7dBAC0aA440A25D7FB43951f7b178FF7A809108D";
const SBTC_LZ_ADAPTER = "0x3f690f43a9fCA689829A22bf925c89B7a48ca57F";
const NATIVE_TOKEN = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const CBBTC = "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf";

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

describe("StakeStone Stake BTC on Ethereum Adapter: ", async () => {
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

    const StakeStoneStakeBTCEth = await ethers.getContractFactory(
      "StakeStoneStakeBTCEth"
    );
    const stakeStoneStakeBTCEthAdapter = await StakeStoneStakeBTCEth.deploy(
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
      stakeStoneStakeBTCEthAdapter: StakeStoneStakeBTCEth__factory.connect(
        stakeStoneStakeBTCEthAdapter.address,
        deployer
      ),
      sbtc: TokenInterface__factory.connect(SBTC_TOKEN, deployer),
      cbBtc: TokenInterface__factory.connect(CBBTC, deployer),
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
    const { batchTransaction, stakeStoneStakeBTCEthAdapter, sbtc, cbBtc } =
      await setupTests();

    const txn = await getTransaction({
      fromTokenAddress: NATIVE_TOKEN,
      toTokenAddress: CBBTC,
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

    const cbBtcBalBefore = await cbBtc.balanceOf(deployer.address);

    expect(cbBtcBalBefore).gt(0);

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
      [cbBtc.address, deployer.address, unit256Max, dstEid, crossChainData]
    );

    const tokens = [CBBTC];
    const amounts = [cbBtcBalBefore];
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

    await cbBtc.approve(batchTransaction.address, cbBtcBalBefore);

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

    const cbBtcbalAfter = await cbBtc.balanceOf(deployer.address);
    const sbtcBalAfter = await sbtc.balanceOf(deployer.address);

    expect(cbBtcBalBefore).gt(cbBtcbalAfter);
    expect(sbtcBalAfter).gt(sbtcBalBefore);
  });

  it("Can stake on stakeStone on same chain when lz dstEid is not zero", async () => {
    const {
      batchTransaction,
      stakeStoneStakeBTCEthAdapter,
      sbtc,
      lzContract,
      cbBtc,
    } = await setupTests();

    const txn = await getTransaction({
      fromTokenAddress: NATIVE_TOKEN,
      toTokenAddress: CBBTC,
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

    const cbBtcBalBefore = await cbBtc.balanceOf(deployer.address);

    expect(cbBtcBalBefore).gt(0);
    const dstEid = "30102";

    const fee = await lzContract.quoteSend(
      {
        dstEid: dstEid,
        to: ethers.utils.hexZeroPad(deployer.address, 32),
        amountLD: "7937250800000000000",
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
      [cbBtc.address, deployer.address, unit256Max, dstEid, crossChainData]
    );

    const tokens = [CBBTC];
    const amounts = [cbBtcBalBefore];
    const targets = [stakeStoneStakeBTCEthAdapter.address];
    const data = [stakeStoneData];
    const value = [0];
    const callType = [2];
    const sbtcBalBefore = await sbtc.balanceOf(deployer.address);

    const feeData = defaultAbiCoder.encode(
      ["uint256[]", "uint96[]", "address[]", "uint256[]", "bool"],
      [["1"], ["0"], tokens, amounts, true]
    );

    await cbBtc.approve(batchTransaction.address, cbBtcBalBefore);

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
    expect(sbtcBalAfter.sub(sbtcBalBefore)).lt(10**13);
  });
});
