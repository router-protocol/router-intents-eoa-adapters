import hardhat, { ethers, waffle } from "hardhat";
import { expect } from "chai";
import { RPC } from "../constants";
import { DEXSPAN, DEFAULT_ENV, WNATIVE } from "../../tasks/constants";
import { BatchTransaction__factory } from "../../typechain/factories/BatchTransaction__factory";
import { FeeAdapter__factory } from "../../typechain/factories/FeeAdapter__factory";
import { StakeStoneStakeEth__factory } from "../../typechain/factories/StakeStoneStakeEth__factory";
import { defaultAbiCoder } from "ethers/lib/utils";
import { zeroAddress } from "ethereumjs-util";
import { TokenInterface__factory } from "../../typechain/factories/TokenInterface__factory";
import { IWETH__factory } from "../../typechain/factories/IWETH__factory";
const CHAIN_ID = "1";
const FEE_WALLET = "0x00EB64b501613F8Cf8Ef3Ac4F82Fc63a50343fee";
const USDT = "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9";
const NATIVE_TOKEN = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const STONE_TOKEN = "0x7122985656e38BDC0302Db86685bb972b145bD3C";
const STONE_VAULT = "0xA62F9C5af106FeEE069F38dE51098D9d81B90572";

const LZ_CONTRACT_ABI = [
  "function estimateSendFee(uint16 _dstChainId, bytes calldata _toAddress, uint _amount, bool _useZro, bytes calldata _adapterParams) external view returns (uint nativeFee, uint zroFee)",
];
describe("Fee Adapter: ", async () => {
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

    const StakeStoneStakeEth = await ethers.getContractFactory(
      "StakeStoneStakeEth"
    );
    const stakeStoneStakeEthAdapter = await StakeStoneStakeEth.deploy(
      NATIVE_TOKEN,
      WNATIVE[env][CHAIN_ID],
      STONE_VAULT,
      STONE_TOKEN
    );

    const lzContract = await ethers.getContractAt(
      LZ_CONTRACT_ABI,
      STONE_TOKEN,
      deployer
    );

    await batchTransaction.setAdapterWhitelist(
      [feeAdapter.address, stakeStoneStakeEthAdapter.address],
      [true, true]
    );
    const FeeDataStoreAddress = await feeAdapter.feeDataStore();

    const FeeDataStoreContract = await ethers.getContractFactory(
      "FeeDataStore"
    );
    const feeDataStoreInstance =
      FeeDataStoreContract.attach(FeeDataStoreAddress);
    // const feeDSt = FeeDataStore__factory.connect(
    //   feeDataStore.address,
    //   deployer
    // );
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
      usdt: TokenInterface__factory.connect(USDT, deployer),
      wnative: IWETH__factory.connect(WNATIVE[env][CHAIN_ID], deployer),
      stakeStoneStakeEthAdapter: StakeStoneStakeEth__factory.connect(
        stakeStoneStakeEthAdapter.address,
        deployer
      ),
      stone: TokenInterface__factory.connect(STONE_TOKEN, deployer),
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

  it("Deduct fee in normal flow when batch handler fee is deducted, swap from ETH to USDT", async () => {
    const { batchTransaction, stakeStoneStakeEthAdapter, stone } =
      await setupTests();

    const amount = ethers.utils.parseEther("1");
    const dstEid = "0";
    const nativeFee = "0";
    const refundAddress = deployer.address;
    const crossChainData = defaultAbiCoder.encode(
      ["uint256", "address"],
      [nativeFee, refundAddress]
    );

    const unit256Max = ethers.BigNumber.from(
      "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"
    );

    const stakeStoneData = defaultAbiCoder.encode(
      ["address", "uint256", "uint16", "bytes"],
      [deployer.address, unit256Max, dstEid, crossChainData]
    );

    const tokens = [NATIVE_TOKEN];
    const amounts = [amount];
    const appId = [1];
    const fee = ["100000000000"];

    const feeData = defaultAbiCoder.encode(
      ["uint256[]", "uint96[]", "address[]", "uint256[]", "bool"],
      [appId, fee, tokens, amounts, true]
    );

    const targets = [stakeStoneStakeEthAdapter.address];
    const data = [stakeStoneData];
    const value = [0];
    const callType = [2];
    // const feeInfo = [{ fee: 0, recipient: zeroAddress() }];
    const balBefore = await ethers.provider.getBalance(deployer.address);
    const stoneBalBefore = await stone.balanceOf(deployer.address);
    const handlerBalancerBefore = await ethers.provider.getBalance(FEE_WALLET);
    const payBalancerBefore = await ethers.provider.getBalance(
      "0xBec33ce33afdAF5604CCDF2c4b575238C5FBD23d"
    );

    await batchTransaction.executeBatchCallsSameChain(
      0,
      tokens,
      amounts,
      feeData,
      targets,
      value,
      callType,
      data,
      {
        value: amount,
        gasLimit: 10000000,
      }
    );

    const balAfter = await ethers.provider.getBalance(deployer.address);
    const stoneBalAfter = await stone.balanceOf(deployer.address);
    const handlerBalancerAfter = await ethers.provider.getBalance(FEE_WALLET);
    const payBalancerAfter = await ethers.provider.getBalance(
      "0xBec33ce33afdAF5604CCDF2c4b575238C5FBD23d"
    );
    expect(handlerBalancerAfter).gt(handlerBalancerBefore);
    expect(payBalancerAfter).gt(payBalancerBefore);
    expect(balBefore).gt(balAfter);
    expect(stoneBalAfter).gt(stoneBalBefore);
  });

  it("Deduct fee in normal flow when batch handler fee is not deducted", async () => {
    const { batchTransaction, stakeStoneStakeEthAdapter, stone } =
      await setupTests();

    const amount = ethers.utils.parseEther("1");
    const dstEid = "0";
    const nativeFee = "0";
    const refundAddress = deployer.address;
    const crossChainData = defaultAbiCoder.encode(
      ["uint256", "address"],
      [nativeFee, refundAddress]
    );
    const unit256Max = ethers.BigNumber.from(
      "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"
    );

    const stakeStoneData = defaultAbiCoder.encode(
      ["address", "uint256", "uint16", "bytes"],
      [deployer.address, unit256Max, dstEid, crossChainData]
    );

    const tokens = [NATIVE_TOKEN];
    const amounts = [amount];
    const appId = [1];
    const fee = ["100000000000"];

    const feeData = defaultAbiCoder.encode(
      ["uint256[]", "uint96[]", "address[]", "uint256[]", "bool"],
      [appId, fee, tokens, amounts, false]
    );

    const targets = [stakeStoneStakeEthAdapter.address];
    const data = [stakeStoneData];
    const value = [0];
    const callType = [2];
    // const feeInfo = [{ fee: 0, recipient: zeroAddress() }];
    const balBefore = await ethers.provider.getBalance(deployer.address);
    const stoneBalBefore = await stone.balanceOf(deployer.address);
    const handlerBalancerBefore = await ethers.provider.getBalance(FEE_WALLET);
    const payBalancerBefore = await ethers.provider.getBalance(
      "0xBec33ce33afdAF5604CCDF2c4b575238C5FBD23d"
    );

    await batchTransaction.executeBatchCallsSameChain(
      0,
      tokens,
      amounts,
      feeData,
      targets,
      value,
      callType,
      data,
      {
        value: amount,
        gasLimit: 10000000,
      }
    );

    const balAfter = await ethers.provider.getBalance(deployer.address);
    const stoneBalAfter = await stone.balanceOf(deployer.address);
    const handlerBalancerAfter = await ethers.provider.getBalance(FEE_WALLET);
    const payBalancerAfter = await ethers.provider.getBalance(
      "0xBec33ce33afdAF5604CCDF2c4b575238C5FBD23d"
    );
    expect(handlerBalancerAfter).eqls(handlerBalancerBefore);
    expect(stoneBalAfter).gt(stoneBalBefore);
    expect(payBalancerAfter).gt(payBalancerBefore);
    expect(balBefore).gt(balAfter);
  });

  it("Deduct No fee when inactive", async () => {
    const { batchTransaction, stakeStoneStakeEthAdapter, stone } =
      await setupTests();

    const amount = ethers.utils.parseEther("1");
    const dstEid = "0";
    const nativeFee = "0";
    const refundAddress = deployer.address;
    const crossChainData = defaultAbiCoder.encode(
      ["uint256", "address"],
      [nativeFee, refundAddress]
    );

    const unit256Max = ethers.BigNumber.from(
      "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"
    );

    const stakeStoneData = defaultAbiCoder.encode(
      ["address", "uint256", "uint16", "bytes"],
      [deployer.address, unit256Max, dstEid, crossChainData]
    );
    const tokens = [NATIVE_TOKEN];
    const amounts = [amount];
    const appId = [0];
    const fee = ["0"];

    const feeData = defaultAbiCoder.encode(
      ["uint256[]", "uint96[]", "address[]", "uint256[]", "bool"],
      [appId, fee, tokens, amounts, false]
    );
    const targets = [stakeStoneStakeEthAdapter.address];
    const data = [stakeStoneData];
    const value = [0];
    const callType = [2];
    // const feeInfo = [{ fee: 0, recipient: zeroAddress() }];
    const balBefore = await ethers.provider.getBalance(deployer.address);
    const stoneBalBefore = await stone.balanceOf(deployer.address);
    const handlerBalancerBefore = await ethers.provider.getBalance(FEE_WALLET);
    const payBalancerBefore = await ethers.provider.getBalance(
      "0xBec33ce33afdAF5604CCDF2c4b575238C5FBD23d"
    );

    await batchTransaction.executeBatchCallsSameChain(
      0,
      tokens,
      amounts,
      feeData,
      targets,
      value,
      callType,
      data,
      {
        value: amount,
        gasLimit: 10000000,
      }
    );

    const balAfter = await ethers.provider.getBalance(deployer.address);
    const stoneBalAfter = await stone.balanceOf(deployer.address);
    const handlerBalancerAfter = await ethers.provider.getBalance(FEE_WALLET);
    const payBalancerAfter = await ethers.provider.getBalance(
      "0xBec33ce33afdAF5604CCDF2c4b575238C5FBD23d"
    );
    expect(handlerBalancerAfter).eqls(handlerBalancerBefore);
    expect(payBalancerAfter).eqls(payBalancerBefore);
    expect(balBefore).gt(balAfter);
    expect(stoneBalAfter).gt(stoneBalBefore);
  });
});
