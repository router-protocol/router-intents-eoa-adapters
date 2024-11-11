import hardhat, { ethers, waffle } from "hardhat";
import { expect } from "chai";
import { defaultAbiCoder } from "ethers/lib/utils";
import { RPC } from "../constants";
import { DEXSPAN, DEFAULT_ENV } from "../../tasks/constants";
import { AerodromeMint__factory } from "../../typechain/factories/AerodromeMint__factory";
import { TokenInterface__factory } from "../../typechain/factories/TokenInterface__factory";
import { MockAssetForwarder__factory } from "../../typechain/factories/MockAssetForwarder__factory";
import { BatchTransaction__factory } from "../../typechain/factories/BatchTransaction__factory";
import { IWETH__factory } from "../../typechain/factories/IWETH__factory";
import { IAerodromeRouter__factory } from "../../typechain/factories/IAerodromeRouter__factory";
import { BigNumber, Contract, Wallet } from "ethers";
import { getTransaction } from "../utils";
import { AERODROME_ROUTER } from "../../tasks/deploy/aerodrome/constants";
import { zeroAddress } from "ethereumjs-util";
import { MaxUint256 } from "@ethersproject/constants";

const CHAIN_ID = "8453";
const USDC = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
const NATIVE_TOKEN = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const WNATIVE = "0x4200000000000000000000000000000000000006";
const USDC_WETH_POOL = "0xcDAC0d6c6C59727a65F871236188350531885C43";
const FEE_WALLET = "0x00EB64b501613F8Cf8Ef3Ac4F82Fc63a50343fee"
describe("AerodromeMint Adapter: ", async () => {
  const [deployer, alice] = waffle.provider.getWallets();

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
      WNATIVE,
      FEE_WALLET,
      5
    );

    const BatchTransaction = await ethers.getContractFactory(
      "BatchTransaction"
    );

    const batchTransaction = await BatchTransaction.deploy(
      NATIVE_TOKEN,
      WNATIVE,
      mockAssetForwarder.address,
      DEXSPAN[env][CHAIN_ID],
      zeroAddress(),
      feeAdapter.address
    );

    const AerodromeMintPositionAdapter = await ethers.getContractFactory(
      "AerodromeMint"
    );
    const aerodromeMintPositionAdapter =
      await AerodromeMintPositionAdapter.deploy(
        NATIVE_TOKEN,
        WNATIVE,
        AERODROME_ROUTER[CHAIN_ID]
      );

    await batchTransaction.setAdapterWhitelist(
      [aerodromeMintPositionAdapter.address, feeAdapter.address],
      [true, true]
    );

    const MockToken = await ethers.getContractFactory("MockToken");
    const mockToken = await MockToken.deploy();
    await mockToken.mint(deployer.address, ethers.utils.parseEther("10000"));

    const usdc_weth_pool = TokenInterface__factory.connect(
      USDC_WETH_POOL,
      deployer
    );

    return {
      batchTransaction: BatchTransaction__factory.connect(
        batchTransaction.address,
        deployer
      ),
      aerodromeMintPositionAdapter: AerodromeMint__factory.connect(
        aerodromeMintPositionAdapter.address,
        deployer
      ),
      mockToken: TokenInterface__factory.connect(mockToken.address, deployer),
      mockAssetForwarder: MockAssetForwarder__factory.connect(
        mockAssetForwarder.address,
        deployer
      ),
      usdc: TokenInterface__factory.connect(USDC, deployer),
      wnative: IWETH__factory.connect(WNATIVE, deployer),
      router: IAerodromeRouter__factory.connect(
        AERODROME_ROUTER[CHAIN_ID],
        deployer
      ),
      usdc_weth_pool,
    };
  };

  beforeEach(async function () {
    await hardhat.network.provider.request({
      method: "hardhat_reset",
      params: [
        {
          forking: {
            jsonRpcUrl: "https://base-mainnet.g.alchemy.com/v2/bh8kdOiwQ7zFD7fJYheIbHDEzbobAi9x",
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

  it("Can mint a new position on Aerodrome weth/usdc", async () => {
    const {
      batchTransaction,
      aerodromeMintPositionAdapter,
      usdc,
      wnative,
      usdc_weth_pool,
    } = await setupTests();

    await wnative.deposit({ value: ethers.utils.parseEther("0.1") });
    // await setUserTokenBalance(usdc, deployer, ethers.utils.parseEther("1"));

    const txn = await getTransaction({
      fromTokenAddress: NATIVE_TOKEN,
      toTokenAddress: USDC,
      amount: ethers.utils.parseEther("0.2").toString(),
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
    expect(await usdc.balanceOf(deployer.address)).gt(0);

    const wethBal = await wnative.balanceOf(USDC_WETH_POOL);
    const wethBalNum = Number(wethBal.toString());
    const usdcBal = await usdc.balanceOf(USDC_WETH_POOL);
    const usdcBalNum = Number(usdcBal.toString());
    const wethDecimals = 10 ** 18;
    const usdcDecimals = 10 ** 6;

    const multipliier =
      (usdcBalNum * wethDecimals) / (usdcDecimals * wethBalNum);

    const user = deployer;
    const tokenA = wnative.address;
    const tokenB = usdc.address;
    const stable = false;
    const amountADesired = ethers.utils.parseEther("0.1").toString();
    const amountBDesired = parseInt((0.1 * multipliier * 10 ** 6).toString()); //(amountA) * multipliier * decimals;
    const amountAMin = ethers.utils.parseEther("0.05").toString();
    const amountBMin = "194000000".toString();
    const deadline = 10000000000;

    const mintParams = {
      tokenA,
      tokenB,
      stable,
      amountADesired,
      amountBDesired,
      amountAMin,
      amountBMin,
      to: user.address,
      deadline,
    };

    const mintParamsIface =
      "tuple(address tokenA, address tokenB, bool stable, uint256 amountADesired, uint256 amountBDesired, uint256 amountAMin, uint256 amountBMin, address to, uint256 deadline) AeroSupplyData";

    const aerodromeData = defaultAbiCoder.encode(
      [mintParamsIface],
      [mintParams]
    );

    const tokens = [mintParams.tokenA, mintParams.tokenB];
    const amounts = [ethers.constants.MaxUint256, ethers.constants.MaxUint256];

    const feeInfo = [
      {
        fee: BigNumber.from(mintParams.amountADesired).mul(5).div(1000),
        recipient: alice.address,
      },
      {
        fee: BigNumber.from(mintParams.amountBDesired).mul(5).div(1000),
        recipient: alice.address,
      },
    ];

    if (mintParams.tokenA === wnative.address) {
      await wnative.approve(
        batchTransaction.address,
        mintParams.amountADesired
      );
      await usdc.approve(batchTransaction.address, mintParams.amountBDesired);
    } else {
      await usdc.approve(batchTransaction.address, mintParams.amountADesired);
      await wnative.approve(
        batchTransaction.address,
        mintParams.amountBDesired
      );
    }

    const lpBalBefore = await usdc_weth_pool.balanceOf(deployer.address);

    await batchTransaction.executeBatchCallsSameChain(
      0,
      tokens,
      amounts,
      feeInfo,
      [aerodromeMintPositionAdapter.address],
      [0],
      [2],
      [aerodromeData]
    );

    const lpBalAfter = await usdc_weth_pool.balanceOf(deployer.address);

    expect(lpBalAfter).gt(lpBalBefore);
  });

  it("Can mint a new position on Aerodrome usdc/weth", async () => {
    const {
      batchTransaction,
      aerodromeMintPositionAdapter,
      usdc,
      wnative,
      usdc_weth_pool,
    } = await setupTests();

    await wnative.deposit({ value: ethers.utils.parseEther("0.1") });
    // await setUserTokenBalance(usdc, deployer, ethers.utils.parseEther("1"));

    const txn = await getTransaction({
      fromTokenAddress: NATIVE_TOKEN,
      toTokenAddress: USDC,
      amount: ethers.utils.parseEther("0.2").toString(),
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
    expect(await usdc.balanceOf(deployer.address)).gt(0);

    const wethBal = await wnative.balanceOf(USDC_WETH_POOL);
    const wethBalNum = Number(wethBal.toString());
    const usdcBal = await usdc.balanceOf(USDC_WETH_POOL);
    const usdcBalNum = Number(usdcBal.toString());
    const wethDecimals = 10 ** 18;
    const usdcDecimals = 10 ** 6;

    const multipliier =
      (usdcBalNum * wethDecimals) / (usdcDecimals * wethBalNum);

    const user = deployer;
    const tokenA = usdc.address;
    const tokenB = wnative.address;
    const stable = false;
    const amountBDesired = ethers.utils.parseEther("0.1").toString();
    const amountADesired = parseInt((0.1 * multipliier * 10 ** 6).toString()); //(amountA) * multipliier * decimals;
    const amountBMin = ethers.utils.parseEther("0.05").toString();
    const amountAMin = "194000000".toString();
    const deadline = 10000000000;

    const mintParams = {
      tokenA,
      tokenB,
      stable,
      amountADesired,
      amountBDesired,
      amountAMin,
      amountBMin,
      to: user.address,
      deadline,
    };

    const mintParamsIface =
      "tuple(address tokenA, address tokenB, bool stable, uint256 amountADesired, uint256 amountBDesired, uint256 amountAMin, uint256 amountBMin, address to, uint256 deadline) AeroSupplyData";

    const aerodromeData = defaultAbiCoder.encode(
      [mintParamsIface],
      [mintParams]
    );

    const tokens = [mintParams.tokenA, mintParams.tokenB];
    const amounts = [MaxUint256, MaxUint256];
    const feeInfo = [
      {
        fee: BigNumber.from(mintParams.amountADesired).mul(5).div(1000),
        recipient: alice.address,
      },
      {
        fee: BigNumber.from(mintParams.amountBDesired).mul(5).div(1000),
        recipient: alice.address,
      },
    ];

    if (mintParams.tokenA === wnative.address) {
      await wnative.approve(
        batchTransaction.address,
        mintParams.amountADesired
      );
      await usdc.approve(batchTransaction.address, mintParams.amountBDesired);
    } else {
      await usdc.approve(batchTransaction.address, mintParams.amountADesired);
      await wnative.approve(
        batchTransaction.address,
        mintParams.amountBDesired
      );
    }

    const lpBalBefore = await usdc_weth_pool.balanceOf(deployer.address);

    await batchTransaction.executeBatchCallsSameChain(
      0,
      tokens,
      amounts,
      feeInfo,
      [aerodromeMintPositionAdapter.address],
      [0],
      [2],
      [aerodromeData]
    );
 
    const lpBalAfter = await usdc_weth_pool.balanceOf(deployer.address);

    expect(lpBalAfter).gt(lpBalBefore);
  });
});
