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
import { getSwapModeData } from "./utils";
import { decodeExecutionEvent } from "../utils";
import { zeroAddress } from "ethereumjs-util";

const CHAIN_ID = "34443";
const SWAPMODE_POSITION_MANAGER = "0xcc3726bCc27f232bC1CaAB40853AEa91ae43C216";
const USDC = "0xd988097fb8612cc24eec14542bc03424c656005f";
const USDT = "0xf0F161fDA2712DB8b566946122a5af183995e2eD";
const NATIVE_TOKEN = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const WNATIVE = "0x4200000000000000000000000000000000000006";
const SWAP_ROUTER = "0xc1e624C810D297FD70eF53B0E08F44FABE468591";

const SWAP_ROUTER_ABI = [
  "function swapExactETHForTokens(uint256 amountOutMin, address[] calldata path, address to, uint256 deadline) external payable returns (uint256[] memory amounts)",
];

describe("SwapModeMint Adapter: ", async () => {
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
      DEXSPAN[env][CHAIN_ID],
      zeroAddress()
    );

    const SwapModeMintPositionAdapter = await ethers.getContractFactory(
      "SwapModeMint"
    );
    const swapModeMintPositionAdapter =
      await SwapModeMintPositionAdapter.deploy(
        NATIVE_TOKEN,
        WNATIVE,
        SWAPMODE_POSITION_MANAGER
      );

    await batchTransaction.setAdapterWhitelist(
      [swapModeMintPositionAdapter.address],
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
      swapModeMintPositionAdapter: SwapModeMint__factory.connect(
        swapModeMintPositionAdapter.address,
        deployer
      ),
      mockToken: TokenInterface__factory.connect(mockToken.address, deployer),
      mockAssetForwarder: MockAssetForwarder__factory.connect(
        mockAssetForwarder.address,
        deployer
      ),
      usdc: TokenInterface__factory.connect(USDC, deployer),
      usdt: TokenInterface__factory.connect(USDT, deployer),
      wnative: IWETH__factory.connect(WNATIVE, deployer),
      positionManager: IUniswapV3NonfungiblePositionManager__factory.connect(
        SWAPMODE_POSITION_MANAGER,
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

  it("Can mint a new position on SwapMode", async () => {
    const {
      batchTransaction,
      swapModeMintPositionAdapter,
      positionManager,
      usdc,
      usdt,
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
    const chainId = CHAIN_ID;
    const token0 = usdt.address;
    const token1 = usdc.address;
    const amount0 = usdtBal.toString();
    const amount1 = usdcBal.toString();
    const fee = 80;

    const mintParams = await getSwapModeData({
      user,
      chainId,
      token0,
      token1,
      amount0,
      amount1,
      fee,
    });

    const mintParamsIface =
      "tuple(address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint256 amount0Desired, uint256 amount1Desired, uint256 amount0Min, uint256 amount1Min, address recipient, uint256 deadline) MintParams";

    const swapModeData = defaultAbiCoder.encode(
      [mintParamsIface],
      [mintParams]
    );

    const tokens = [mintParams.token0, mintParams.token1];
    const amounts = [mintParams.amount0Desired, mintParams.amount1Desired];
    const feeInfo = [
      { fee: 0, recipient: zeroAddress() },
      { fee: 0, recipient: zeroAddress() },
    ];

    if (mintParams.token0 === usdt.address) {
      await usdt.approve(batchTransaction.address, mintParams.amount0Desired);
      await usdc.approve(batchTransaction.address, mintParams.amount1Desired);
    } else {
      await usdc.approve(batchTransaction.address, mintParams.amount0Desired);
      await usdt.approve(batchTransaction.address, mintParams.amount1Desired);
    }

    const tx = await batchTransaction.executeBatchCallsSameChain(
      0,
      tokens,
      amounts,
      feeInfo,
      [swapModeMintPositionAdapter.address],
      [0],
      [2],
      [swapModeData],
      { gasLimit: 10000000 }
    );
    const txReceipt = await tx.wait();

    const { data: swapModeExecutionEventData } =
      decodeExecutionEvent(txReceipt);

    const swapModeEventData = defaultAbiCoder.decode(
      [mintParamsIface, "uint256"],
      swapModeExecutionEventData
    );

    const position = await positionManager.positions(swapModeEventData[1]);
    expect(position.token0).eq(mintParams.token0);
    expect(position.token1).eq(mintParams.token1);
    expect(position.fee).eq(mintParams.fee);
  });
});
