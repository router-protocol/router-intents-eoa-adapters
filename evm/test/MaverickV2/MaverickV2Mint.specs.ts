import hardhat, { ethers, waffle } from "hardhat";
import { expect } from "chai";
import { RPC } from "../constants";
import { DEFAULT_ENV, WNATIVE, NATIVE } from "../../tasks/constants";
import { TokenInterface__factory } from "../../typechain/factories/TokenInterface__factory";
import { MockAssetForwarder__factory } from "../../typechain/factories/MockAssetForwarder__factory";
import { BatchTransaction__factory } from "../../typechain/factories/BatchTransaction__factory";
import { MaverickV2Mint__factory } from "../../typechain/factories/MaverickV2Mint__factory";
import { IMaverickV2Quoter__factory } from "../../typechain/factories/IMaverickV2Quoter__factory";
import { IMaverickV2PoolLens__factory } from "../../typechain/factories/IMaverickV2PoolLens__factory";
import { IMaverickV2Pool__factory } from "../../typechain/factories/IMaverickV2Pool__factory";
import { IMaverickV2RewardsRouter__factory } from "../../typechain/factories/IMaverickV2RewardsRouter__factory";
import { defaultAbiCoder } from "ethers/lib/utils";
import { MAVERICK_V2_REWARDS_ROUTER } from "../../tasks/deploy/maverickV2/constants";
import { BigNumber, Contract, Wallet } from "ethers";
import { zeroAddress } from "ethereumjs-util";

const CHAIN_ID = "84532";
const SAND = "0x434d7C7aE444B28d1ff275cf96A7783b035Cf4Db";
const USDT = "0xa4042C856BE58D11E6f0957842412D7172781236";
const SAND_USDT_POOL = "0xfE86ac2A66599fcddc8f06f97125B3BfDbBf7d22";

const MAVERICK_V2_POOL_LENS = "0x56eFfDD51b20705e152CAF482D9A6972e97B571C";
const MAVERICK_V2_POOL_QUOTER = "0xb40AfdB85a07f37aE217E7D6462e609900dD8D7A";

describe("MaverickV2Mint Adapter: ", async () => {
  const [deployer] = waffle.provider.getWallets();

  const setupTests = async () => {
    let env = process.env.ENV;
    if (!env) env = DEFAULT_ENV;

    const MockAssetForwarder = await ethers.getContractFactory(
      "MockAssetForwarder"
    );
    const mockAssetForwarder = await MockAssetForwarder.deploy();

    const MaverickV2Mint = await ethers.getContractFactory("MaverickV2Mint");

    const maverickV2MintAdapter = await MaverickV2Mint.deploy(
      NATIVE,
      WNATIVE[env][CHAIN_ID],
      MAVERICK_V2_REWARDS_ROUTER[CHAIN_ID]
    );

    const BatchTransaction = await ethers.getContractFactory(
      "BatchTransaction"
    );

    const batchTransaction = await BatchTransaction.deploy(
      NATIVE,
      WNATIVE[env][CHAIN_ID],
      mockAssetForwarder.address,
      mockAssetForwarder.address,
      zeroAddress()
    );

    await batchTransaction.setAdapterWhitelist(
      [maverickV2MintAdapter.address],
      [true]
    );

    const sand = TokenInterface__factory.connect(SAND, deployer);
    const usdt = TokenInterface__factory.connect(USDT, deployer);

    const maverickV2Quoter = IMaverickV2Quoter__factory.connect(
      MAVERICK_V2_POOL_QUOTER,
      deployer
    );

    const maverickV2PoolLens = IMaverickV2PoolLens__factory.connect(
      MAVERICK_V2_POOL_LENS,
      deployer
    );

    const maverickV2RewardsRouter = IMaverickV2RewardsRouter__factory.connect(
      MAVERICK_V2_REWARDS_ROUTER[CHAIN_ID],
      deployer
    );

    const sandUsdtPool = IMaverickV2Pool__factory.connect(
      SAND_USDT_POOL,
      deployer
    );

    return {
      maverickV2MintAdapter: MaverickV2Mint__factory.connect(
        maverickV2MintAdapter.address,
        deployer
      ),
      batchTransaction: BatchTransaction__factory.connect(
        batchTransaction.address,
        deployer
      ),
      sand,
      usdt,
      mockAssetForwarder: MockAssetForwarder__factory.connect(
        mockAssetForwarder.address,
        deployer
      ),
      maverickV2PoolLens,
      maverickV2Quoter,
      maverickV2RewardsRouter,
      sandUsdtPool,
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

  it("Can add liquidity on maverick v2", async () => {
    const {
      batchTransaction,
      maverickV2MintAdapter,
      usdt,
      sand,
      maverickV2PoolLens,
      maverickV2Quoter,
      maverickV2RewardsRouter,
      sandUsdtPool,
    } = await setupTests();

    const amount = ethers.utils.parseEther("10000");
    await setUserTokenBalance(sand, deployer, amount);
    const sandBal = await sand.balanceOf(deployer.address);
    expect(sandBal).gt(0);

    await setUserTokenBalance(usdt, deployer, amount);
    const usdtBal = await usdt.balanceOf(deployer.address);
    expect(usdtBal).gt(0);

    await usdt.approve(batchTransaction.address, amount);
    await sand.approve(batchTransaction.address, amount);

    const activeTick = Number((await sandUsdtPool.getState()).activeTick);

    const ticks = [
      activeTick - 2,
      activeTick - 1,
      activeTick,
      activeTick + 1,
      activeTick + 2,
    ];

    const relativeLiquidityAmounts = [
      BigInt(1e22),
      BigInt(1e22),
      BigInt(1e22),
      BigInt(1e22),
      BigInt(1e22),
    ];
    const maxAmountA = BigInt(1e4);
    const slippageFactor = BigInt(0.01e18);
    const addSpec = {
      slippageFactorD18: slippageFactor,
      numberOfPriceBreaksPerSide: 3,
      targetAmount: maxAmountA,
      targetIsA: true,
    };

    const params = {
      pool: sandUsdtPool.address,
      kind: 0,
      ticks: ticks,
      relativeLiquidityAmounts: relativeLiquidityAmounts,
      addSpec: addSpec,
    };

    const [
      packedSqrtPriceBreaks,
      packedArgs,
      sqrtPriceBreaks,
      addParams,
      tickDeltas,
    ] = await maverickV2PoolLens.callStatic.getAddLiquidityParams(params);

    const [amountA, amountB] =
      await maverickV2Quoter.callStatic.calculateAddLiquidity(
        sandUsdtPool.address,
        addParams[3]
      );

    const sqrtPrice = BigInt(
      (
        await maverickV2PoolLens.getPoolSqrtPrice(sandUsdtPool.address)
      ).toString()
    );

    const args0 = maverickV2RewardsRouter.interface.encodeFunctionData(
      "checkSqrtPrice",
      [
        sandUsdtPool.address,
        (sqrtPrice * BigInt(1e18)) / (BigInt(1e18) + BigInt(slippageFactor)),
        (sqrtPrice * (BigInt(1e18) + BigInt(slippageFactor))) / BigInt(1e18),
      ]
    );

    const args1 = maverickV2RewardsRouter.interface.encodeFunctionData(
      "mintPositionNft",
      [
        sandUsdtPool.address,
        deployer.address,
        packedSqrtPriceBreaks,
        packedArgs,
      ]
    );

    const args = [args0, args1];

    const maverickV2SupplyData = {
      tokenA: sand.address,
      tokenB: usdt.address,
      tokenAAmount: amountA,
      tokenBAmount: amountB,
      recipient: deployer.address,
      data: args,
    };

    const supplyDataIface =
      "tuple(address tokenA, address tokenB, uint256 tokenAAmount, uint256 tokenBAmount, address recipient, bytes[] data) SupplyData";

    const maverickV2Data = defaultAbiCoder.encode(
      [supplyDataIface],
      [maverickV2SupplyData]
    );

    const tokens = [sand.address, usdt.address];
    const amounts = [amountA, amountB];
    const feeInfo = [
      { fee: 0, recipient: zeroAddress() },
      { fee: 0, recipient: zeroAddress() },
    ];

    await batchTransaction.executeBatchCallsSameChain(
      0,
      tokens,
      amounts,
      feeInfo,
      [maverickV2MintAdapter.address],
      [0],
      [2],
      [maverickV2Data]
    );
  });
});
