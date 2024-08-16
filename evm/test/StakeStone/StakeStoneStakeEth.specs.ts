import hardhat, { ethers, waffle } from "hardhat";
import { expect } from "chai";
import { RPC } from "../constants";
import { DEXSPAN, DEFAULT_ENV, WNATIVE } from "../../tasks/constants";
import { StakeStoneStakeEth__factory } from "../../typechain/factories/StakeStoneStakeEth__factory";
import { TokenInterface__factory } from "../../typechain/factories/TokenInterface__factory";
import { MockAssetForwarder__factory } from "../../typechain/factories/MockAssetForwarder__factory";
import { BatchTransaction__factory } from "../../typechain/factories/BatchTransaction__factory";
import { defaultAbiCoder } from "ethers/lib/utils";
import { zeroAddress } from "ethereumjs-util";

const CHAIN_ID = "1";
const STONE_TOKEN = "0x7122985656e38BDC0302Db86685bb972b145bD3C";
const STONE_VAULT = "0xA62F9C5af106FeEE069F38dE51098D9d81B90572";
const NATIVE_TOKEN = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";

const LZ_CONTRACT_ABI = [
  "function estimateSendFee(uint16 _dstChainId, bytes calldata _toAddress, uint _amount, bool _useZro, bytes calldata _adapterParams) external view returns (uint nativeFee, uint zroFee)",
];

const LZ_ULTRALITENODE = "0x4D73AdB72bC3DD368966edD0f0b2148401A178E2";

describe("StakeStoneStakeEth Adapter: ", async () => {
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
      [stakeStoneStakeEthAdapter.address],
      [true]
    );

    return {
      batchTransaction: BatchTransaction__factory.connect(
        batchTransaction.address,
        deployer
      ),
      stakeStoneStakeEthAdapter: StakeStoneStakeEth__factory.connect(
        stakeStoneStakeEthAdapter.address,
        deployer
      ),
      mockAssetForwarder: MockAssetForwarder__factory.connect(
        mockAssetForwarder.address,
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

  it("Can stake on stakeStone on same chain when lz dstEid is 0", async () => {
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

    const stakeStoneData = defaultAbiCoder.encode(
      ["address", "uint256", "uint16", "bytes"],
      [deployer.address, amount, dstEid, crossChainData]
    );

    const tokens = [NATIVE_TOKEN];
    const amounts = [amount];
    const targets = [stakeStoneStakeEthAdapter.address];
    const data = [stakeStoneData];
    const value = [0];
    const callType = [2];
    const balBefore = await ethers.provider.getBalance(deployer.address);
    const stoneBalBefore = await stone.balanceOf(deployer.address);

    const fee = ["0"];
    const feeData = defaultAbiCoder.encode(
      ["uint256[]", "uint96[]", "address[]", "uint256[]", "bool"],
      [0, fee, tokens, amounts, false]
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
      { value: amount }
    );

    const balAfter = await ethers.provider.getBalance(deployer.address);
    const stoneBalAfter = await stone.balanceOf(deployer.address);

    expect(balBefore).gt(balAfter);
    expect(stoneBalAfter).gt(stoneBalBefore);
  });

  it("Can stake on stakeStone on same chain when lz dstEid is not zero", async () => {
    const { batchTransaction, stakeStoneStakeEthAdapter, stone, lzContract } =
      await setupTests();

    const amount = ethers.utils.parseEther("1");
    const dstEid = "217";

    const fee = await lzContract.estimateSendFee(
      dstEid,
      defaultAbiCoder.encode(["address"], [stone.address]),
      ethers.utils.parseEther("0.8"),
      false,
      "0x"
    );

    const nativeFee = fee[0];

    const refundAddress = deployer.address;
    const crossChainData = defaultAbiCoder.encode(
      ["uint256", "address"],
      [nativeFee, refundAddress]
    );

    const stakeStoneData = defaultAbiCoder.encode(
      ["address", "uint256", "uint16", "bytes"],
      [deployer.address, ethers.constants.MaxUint256, dstEid, crossChainData]
    );

    const tokens = [NATIVE_TOKEN];
    const amounts = [amount.add(nativeFee)];
    const targets = [stakeStoneStakeEthAdapter.address];
    const data = [stakeStoneData];
    const value = [0];
    const callType = [2];

    const balBefore = await ethers.provider.getBalance(deployer.address);
    const stoneBalBefore = await stone.balanceOf(deployer.address);
    const stoneBalStoneBefore = await stone.balanceOf(stone.address);

    const feeData = defaultAbiCoder.encode(
      ["uint256[]", "uint96[]", "address[]", "uint256[]", "bool"],
      [0, fee, tokens, amounts, false]
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
      { value: amount.add(nativeFee), gasLimit: 10000000 }
    );

    const balAfter = await ethers.provider.getBalance(deployer.address);
    const stoneBalAfter = await stone.balanceOf(deployer.address);
    const stoneBalStoneAfter = await stone.balanceOf(stone.address);

    expect(balBefore).gt(balAfter);
    expect(stoneBalAfter).eq(stoneBalBefore);
    expect(stoneBalStoneAfter).gt(stoneBalStoneBefore);
  });

  it("Can stake ETH on StakeStone on dest chain when instruction is received from BatchTransaction contract", async () => {
    const {
      batchTransaction,
      stakeStoneStakeEthAdapter,
      stone,
      mockAssetForwarder,
    } = await setupTests();

    const amount = "100000000000000000";
    const dstEid = "0";
    const crossChainData = "0x";

    const targets = [stakeStoneStakeEthAdapter.address];
    const data = [
      defaultAbiCoder.encode(
        ["address", "uint256", "uint16", "bytes"],
        [deployer.address, ethers.constants.MaxUint256, dstEid, crossChainData]
      ),
    ];
    const value = [0];
    const callType = [2];

    const assetForwarderData = defaultAbiCoder.encode(
      ["uint256", "address", "address[]", "uint256[]", "uint256[]", "bytes[]"],
      [0, deployer.address, targets, value, callType, data]
    );

    const balBefore = await ethers.provider.getBalance(deployer.address);
    const stoneBalBefore = await stone.balanceOf(deployer.address);

    await mockAssetForwarder.handleMessage(
      NATIVE_TOKEN,
      amount,
      assetForwarderData,
      batchTransaction.address,
      { value: amount, gasLimit: 10000000 }
    );

    const balAfter = await ethers.provider.getBalance(deployer.address);
    const stoneBalAfter = await stone.balanceOf(deployer.address);

    expect(balAfter).lt(balBefore);
    expect(stoneBalAfter).gt(stoneBalBefore);
  });

  it("Can stake ETH on StakeStone on dest chain when instruction is received from BatchTransaction contract if dst id is not zero", async () => {
    const {
      batchTransaction,
      stakeStoneStakeEthAdapter,
      stone,
      mockAssetForwarder,
      lzContract,
    } = await setupTests();

    const amount = ethers.utils.parseEther("1");
    const dstEid = "217";
    const fee = await lzContract.estimateSendFee(
      dstEid,
      defaultAbiCoder.encode(["address"], [stone.address]),
      ethers.utils.parseEther("0.8"),
      false,
      "0x"
    );

    const nativeFee = fee[0];
    const refundAddress = deployer.address;
    const crossChainData = defaultAbiCoder.encode(
      ["uint256", "address"],
      [nativeFee, refundAddress]
    );

    const targets = [stakeStoneStakeEthAdapter.address];
    const data = [
      defaultAbiCoder.encode(
        ["address", "uint256", "uint16", "bytes"],
        [deployer.address, ethers.constants.MaxUint256, dstEid, crossChainData]
      ),
    ];
    const value = [0];
    const callType = [2];

    const assetForwarderData = defaultAbiCoder.encode(
      ["uint256", "address", "address[]", "uint256[]", "uint256[]", "bytes[]"],
      [0, deployer.address, targets, value, callType, data]
    );

    const balBefore = await ethers.provider.getBalance(deployer.address);
    const stoneBalBefore = await stone.balanceOf(deployer.address);
    const stoneBalStoneBefore = await stone.balanceOf(stone.address);

    await mockAssetForwarder.handleMessage(
      NATIVE_TOKEN,
      amount.add(nativeFee),
      assetForwarderData,
      batchTransaction.address,
      { value: amount.add(nativeFee), gasLimit: 10000000 }
    );

    const balAfter = await ethers.provider.getBalance(deployer.address);
    const stoneBalAfter = await stone.balanceOf(deployer.address);
    const stoneBalStoneAfter = await stone.balanceOf(stone.address);

    expect(balAfter).lt(balBefore);
    expect(stoneBalAfter).eq(stoneBalBefore);
    expect(stoneBalStoneAfter).gt(stoneBalStoneBefore);
  });
});
