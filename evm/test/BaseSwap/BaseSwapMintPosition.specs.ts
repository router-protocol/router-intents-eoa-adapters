import hardhat, { ethers, waffle } from "hardhat";
import { expect } from "chai";
import { defaultAbiCoder } from "ethers/lib/utils";
import { RPC } from "../constants";
import { DEXSPAN, DEFAULT_ENV } from "../../tasks/constants";
import { BaseSwapMint__factory } from "../../typechain/factories/BaseSwapMint__factory";
import { TokenInterface__factory } from "../../typechain/factories/TokenInterface__factory";
import { MockAssetForwarder__factory } from "../../typechain/factories/MockAssetForwarder__factory";
import { BatchTransaction__factory } from "../../typechain/factories/BatchTransaction__factory";
import { IWETH__factory } from "../../typechain/factories/IWETH__factory";
import { IUniswapV3NonfungiblePositionManager__factory } from "../../typechain/factories/IUniswapV3NonfungiblePositionManager__factory";
import { BigNumber, Contract, Wallet } from "ethers";
import { getBaseSwapData } from "./utils";
import { decodeExecutionEvent } from "../utils";
import { zeroAddress } from "ethereumjs-util";

const CHAIN_ID = "8453";
const BASESWAP_POSITION_MANAGER = "0xDe151D5c92BfAA288Db4B67c21CD55d5826bCc93";
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const NATIVE_TOKEN = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const WNATIVE = "0x4200000000000000000000000000000000000006";
const SWAP_ROUTER = "0x327Df1E6de05895d2ab08513aaDD9313Fe505d86";

const SWAP_ROUTER_ABI = [
  "function swapExactETHForTokens(uint256 amountOutMin, address[] calldata path, address to, uint256 deadline) external payable returns (uint256[] memory amounts)",
];

describe("BaseSwapMint Adapter: ", async () => {
  const [deployer, alice] = waffle.provider.getWallets();

  const setupTests = async () => {
    let env = process.env.ENV;
    if (!env) env = DEFAULT_ENV;

    const swapRouter = new ethers.Contract(
      SWAP_ROUTER,
      SWAP_ROUTER_ABI,
      deployer
    );

    const MockAssetForwarder = await ethers.getContractFactory(
      "MockAssetForwarder"
    );
    const mockAssetForwarder = await MockAssetForwarder.deploy();

    const BatchTransaction = await ethers.getContractFactory(
      "BatchTransaction"
    );

    const batchTransaction = await BatchTransaction.deploy(
      NATIVE_TOKEN,
      WNATIVE,
      mockAssetForwarder.address,
      DEXSPAN[env][CHAIN_ID],
      zeroAddress()
    );

    const BaseSwapMintPositionAdapter = await ethers.getContractFactory(
      "BaseSwapMint"
    );
    const baseSwapMintPositionAdapter =
      await BaseSwapMintPositionAdapter.deploy(
        NATIVE_TOKEN,
        WNATIVE,
        BASESWAP_POSITION_MANAGER
      );

    await batchTransaction.setAdapterWhitelist(
      [baseSwapMintPositionAdapter.address],
      [true]
    );

    const MockToken = await ethers.getContractFactory("MockToken");
    const mockToken = await MockToken.deploy();
    await mockToken.mint(deployer.address, ethers.utils.parseEther("10000"));

    return {
      batchTransaction: BatchTransaction__factory.connect(
        batchTransaction.address,
        deployer
      ),
      baseSwapMintPositionAdapter: BaseSwapMint__factory.connect(
        baseSwapMintPositionAdapter.address,
        deployer
      ),
      mockToken: TokenInterface__factory.connect(mockToken.address, deployer),
      mockAssetForwarder: MockAssetForwarder__factory.connect(
        mockAssetForwarder.address,
        deployer
      ),
      usdc: TokenInterface__factory.connect(USDC, deployer),
      wnative: IWETH__factory.connect(WNATIVE, deployer),
      positionManager: IUniswapV3NonfungiblePositionManager__factory.connect(
        BASESWAP_POSITION_MANAGER,
        deployer
      ),
      swapRouter,
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

  it("Can mint a new position on BaseSwap", async () => {
    const {
      batchTransaction,
      baseSwapMintPositionAdapter,
      positionManager,
      usdc,
      wnative,
      swapRouter,
    } = await setupTests();

    await wnative.deposit({ value: ethers.utils.parseEther("10") });

    await swapRouter.swapExactETHForTokens(
      "0",
      [wnative.address, usdc.address],
      deployer.address,
      ethers.constants.MaxUint256,
      { value: ethers.utils.parseEther("1") }
    );

    const usdcBal = await usdc.balanceOf(deployer.address);
    expect(usdcBal).gt(0);

    const user = deployer;
    const chainId = CHAIN_ID;
    const token0 = wnative.address;
    const token1 = usdc.address;
    const amount0 = ethers.utils.parseEther("0.1").toString();
    const amount1 = usdcBal.div(10).toString();
    const fee = 450;

    const mintParams = await getBaseSwapData({
      user,
      chainId,
      token0,
      token1,
      amount0,
      amount1,
      fee,
    });

    const tokens = [mintParams.token0, mintParams.token1];
    const amounts = [mintParams.amount0Desired, mintParams.amount1Desired];
    const feeInfo = [
      {
        fee: 0,
        recipient: alice.address,
      },
      {
        fee: 0,
        recipient: alice.address,
      },
    ];

    const mintParamsIface =
      "tuple(address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint256 amount0Desired, uint256 amount1Desired, uint256 amount0Min, uint256 amount1Min, address recipient, uint256 deadline) MintParams";

    const baseSwapData = defaultAbiCoder.encode(
      [mintParamsIface],
      [mintParams]
    );

    if (mintParams.token0 === wnative.address) {
      await wnative.approve(
        batchTransaction.address,
        mintParams.amount0Desired
      );
      await usdc.approve(batchTransaction.address, mintParams.amount1Desired);
    } else {
      await usdc.approve(batchTransaction.address, mintParams.amount0Desired);
      await wnative.approve(
        batchTransaction.address,
        mintParams.amount1Desired
      );
    }

    const tx = await batchTransaction.executeBatchCallsSameChain(
      0,
      tokens,
      amounts,
      feeInfo,
      [baseSwapMintPositionAdapter.address],
      [0],
      [2],
      [baseSwapData],
      { gasLimit: 10000000 }
    );
    const txReceipt = await tx.wait();

    const { data: baseSwapExecutionEventData } =
      decodeExecutionEvent(txReceipt);

    const baseSwapEventData = defaultAbiCoder.decode(
      [mintParamsIface, "uint256"],
      baseSwapExecutionEventData
    );

    const position = await positionManager.positions(baseSwapEventData[1]);
    expect(position.token0).eq(mintParams.token0);
    expect(position.token1).eq(mintParams.token1);
    expect(position.fee).eq(mintParams.fee);
  });
});
