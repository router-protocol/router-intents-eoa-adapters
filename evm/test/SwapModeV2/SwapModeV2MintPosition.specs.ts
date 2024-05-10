import hardhat, { ethers, waffle } from "hardhat";
import { expect } from "chai";
import { defaultAbiCoder } from "ethers/lib/utils";
import { RPC } from "../constants";
import { DEXSPAN, DEFAULT_ENV } from "../../tasks/constants";
import { SwapModeMint__factory } from "../../typechain/factories/SwapModeMint__factory";
import { TokenInterface__factory } from "../../typechain/factories/TokenInterface__factory";
import { MockAssetForwarder__factory } from "../../typechain/factories/MockAssetForwarder__factory";
import { BatchTransaction__factory } from "../../typechain/factories/BatchTransaction__factory";
import { IWETH__factory } from "../../typechain/factories/IWETH__factory";
import { IUniswapV3NonfungiblePositionManager__factory } from "../../typechain/factories/IUniswapV3NonfungiblePositionManager__factory";
import { BigNumber, Contract, Wallet } from "ethers";
import { decodeExecutionEvent } from "../utils";
import { MaxUint256 } from "@ethersproject/constants";

const CHAIN_ID = "34443";
const USDC = "0xd988097fb8612cc24eec14542bc03424c656005f";
const USDT = "0xf0F161fDA2712DB8b566946122a5af183995e2eD";
const NATIVE_TOKEN = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const WNATIVE = "0x4200000000000000000000000000000000000006";
const SWAP_ROUTER = "0xc1e624C810D297FD70eF53B0E08F44FABE468591";
const USDC_USDT_LP_ADDRESS = "0xeb4B0563AAC65980245660496E76d03C90aD7B26";

const SWAP_ROUTER_ABI = [
  "function swapExactETHForTokens(uint256 amountOutMin, address[] calldata path, address to, uint256 deadline) external payable returns (uint256[] memory amounts)",
];

describe("SwapModeV2Mint Adapter: ", async () => {
  const [deployer] = waffle.provider.getWallets();

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
      DEXSPAN[env][CHAIN_ID]
    );

    const SwapModeV2MintPositionAdapter = await ethers.getContractFactory(
      "SwapModeV2Mint"
    );
    const swapModeV2MintPositionAdapter =
      await SwapModeV2MintPositionAdapter.deploy(
        NATIVE_TOKEN,
        WNATIVE,
        SWAP_ROUTER
      );

    await batchTransaction.setAdapterWhitelist(
      [swapModeV2MintPositionAdapter.address],
      [true]
    );

    return {
      batchTransaction: BatchTransaction__factory.connect(
        batchTransaction.address,
        deployer
      ),
      swapModeV2MintPositionAdapter: SwapModeMint__factory.connect(
        swapModeV2MintPositionAdapter.address,
        deployer
      ),
      mockAssetForwarder: MockAssetForwarder__factory.connect(
        mockAssetForwarder.address,
        deployer
      ),
      usdc: TokenInterface__factory.connect(USDC, deployer),
      usdt: TokenInterface__factory.connect(USDT, deployer),
      wnative: IWETH__factory.connect(WNATIVE, deployer),
      swapRouter,
      usdcUsdtLp: TokenInterface__factory.connect(
        USDC_USDT_LP_ADDRESS,
        deployer
      ),
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

  it("Can mint a new position on SwapMode", async () => {
    const {
      batchTransaction,
      swapModeV2MintPositionAdapter,
      usdt,
      usdc,
      wnative,
      swapRouter,
      usdcUsdtLp,
    } = await setupTests();

    await swapRouter.swapExactETHForTokens(
      "0",
      [wnative.address, usdc.address],
      deployer.address,
      ethers.constants.MaxUint256,
      { value: ethers.utils.parseEther("1") }
    );
    await swapRouter.swapExactETHForTokens(
      "0",
      [wnative.address, usdt.address],
      deployer.address,
      ethers.constants.MaxUint256,
      { value: ethers.utils.parseEther("1") }
    );

    const usdcBal = await usdc.balanceOf(deployer.address);
    expect(usdcBal).gt(0);

    const usdtBal = await usdt.balanceOf(deployer.address);
    expect(usdtBal).gt(0);

    const user = deployer;
    const tokenA = usdc.address;
    const tokenB = usdt.address;
    const amountA = usdcBal.toString();
    const amountB = usdtBal.toString();

    const mintParamsIface =
      "tuple(address tokenA, address tokenB, uint256 amountADesired, uint256 amountBDesired, uint256 amountAMin, uint256 amountBMin, address to, uint256 deadline) SwapModeV2SupplyData";

    const mintParams = {
      tokenA,
      tokenB,
      amountADesired: amountA,
      amountBDesired: amountB,
      amountAMin: "1000",
      amountBMin: "1000",
      to: user.address,
      deadline: MaxUint256,
    };

    const swapModeData = defaultAbiCoder.encode(
      [mintParamsIface],
      [mintParams]
    );

    const tokens = [mintParams.tokenA, mintParams.tokenB];
    const amounts = [mintParams.amountADesired, mintParams.amountBDesired];

    await usdc.approve(batchTransaction.address, usdcBal);
    await usdt.approve(batchTransaction.address, usdtBal);

    const lpBalBefore = await usdcUsdtLp.balanceOf(user.address);
    expect(lpBalBefore).eq(0);

    await batchTransaction.executeBatchCallsSameChain(
      0,
      tokens,
      amounts,
      [swapModeV2MintPositionAdapter.address],
      [0],
      [2],
      [swapModeData],
      { gasLimit: 10000000 }
    );
    const lpBalAfter = await usdcUsdtLp.balanceOf(user.address);
    expect(lpBalAfter).gt(0);
  });
});
