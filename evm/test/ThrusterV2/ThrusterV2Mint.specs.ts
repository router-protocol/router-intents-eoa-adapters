import hardhat, { ethers, waffle } from "hardhat";
import { expect } from "chai";
import { defaultAbiCoder } from "ethers/lib/utils";
import { RPC } from "../constants";
import { DEXSPAN, DEFAULT_ENV } from "../../tasks/constants";
import { ThrusterV2Mint__factory } from "../../typechain/factories/ThrusterV2Mint__factory";
import { TokenInterface__factory } from "../../typechain/factories/TokenInterface__factory";
import { MockAssetForwarder__factory } from "../../typechain/factories/MockAssetForwarder__factory";
import { BatchTransaction__factory } from "../../typechain/factories/BatchTransaction__factory";
import { IWETH__factory } from "../../typechain/factories/IWETH__factory";
import { MaxUint256 } from "@ethersproject/constants";
import {
  THRUSTER_V2_ROUTER_FEE_ONE,
  THRUSTER_V2_ROUTER_FEE_POINT_THREE,
} from "../../tasks/deploy/thrusterV2/constants";

const CHAIN_ID = "81457";
const NATIVE_TOKEN = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const WNATIVE = "0x4300000000000000000000000000000000000004";
const USDB = "0x4300000000000000000000000000000000000003";
const PAC_MOON = "0x5ffd9EbD27f2fcAB044c0f0a26A45Cb62fa29c06";
const WETH_PAC_MOON_LP_ADDRESS = "0x0F02580E21a0E8241aDd50e56e1cbC72aA33b4a7";
const WETH_USDB_LP_ADDRESS = "0x12c69BFA3fb3CbA75a1DEFA6e976B87E233fc7df";

const SWAP_ROUTER_ABI = [
  "function swapExactETHForTokens(uint256 amountOutMin, address[] calldata path, address to, uint256 deadline) external payable returns (uint256[] memory amounts)",
];

describe("ThrusterV2Mint Adapter: ", async () => {
  const [deployer] = waffle.provider.getWallets();

  const setupTests = async () => {
    let env = process.env.ENV;
    if (!env) env = DEFAULT_ENV;

    const swapRouterFeePointThree = new ethers.Contract(
      THRUSTER_V2_ROUTER_FEE_POINT_THREE[CHAIN_ID],
      SWAP_ROUTER_ABI,
      deployer
    );
    const swapRouterFeeOne = new ethers.Contract(
      THRUSTER_V2_ROUTER_FEE_ONE[CHAIN_ID],
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

    const ThrusterV2MintAdapter = await ethers.getContractFactory(
      "ThrusterV2Mint"
    );
    const thrusterV2MintAdapter = await ThrusterV2MintAdapter.deploy(
      NATIVE_TOKEN,
      WNATIVE,
      THRUSTER_V2_ROUTER_FEE_POINT_THREE[CHAIN_ID],
      THRUSTER_V2_ROUTER_FEE_ONE[CHAIN_ID]
    );

    await batchTransaction.setAdapterWhitelist(
      [thrusterV2MintAdapter.address],
      [true]
    );

    return {
      batchTransaction: BatchTransaction__factory.connect(
        batchTransaction.address,
        deployer
      ),
      thrusterV2MintAdapter: ThrusterV2Mint__factory.connect(
        thrusterV2MintAdapter.address,
        deployer
      ),
      mockAssetForwarder: MockAssetForwarder__factory.connect(
        mockAssetForwarder.address,
        deployer
      ),
      usdb: TokenInterface__factory.connect(USDB, deployer),
      pacMoon: TokenInterface__factory.connect(PAC_MOON, deployer),
      wnative: IWETH__factory.connect(WNATIVE, deployer),
      swapRouterFeeOne,
      swapRouterFeePointThree,
      wethPacmoonLp: TokenInterface__factory.connect(
        WETH_PAC_MOON_LP_ADDRESS,
        deployer
      ),
      wethUsdbtLp: TokenInterface__factory.connect(
        WETH_USDB_LP_ADDRESS,
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

  it("Can mint a new position on Thruster V2 with fee 0.3%", async () => {
    const {
      batchTransaction,
      swapRouterFeePointThree,
      thrusterV2MintAdapter,
      usdb,
      wnative,
      wethUsdbtLp,
    } = await setupTests();

    await swapRouterFeePointThree.swapExactETHForTokens(
      "0",
      [wnative.address, usdb.address],
      deployer.address,
      ethers.constants.MaxUint256,
      { value: ethers.utils.parseEther("1") }
    );

    await wnative.deposit({ value: ethers.utils.parseEther("1") });
    const wnativeBal = await wnative.balanceOf(deployer.address);
    expect(wnativeBal).gt(0);

    const usdbBal = await usdb.balanceOf(deployer.address);
    expect(usdbBal).gt(0);

    const fee = "3000";
    const user = deployer;
    const tokenA = wnative.address;
    const tokenB = usdb.address;
    const amountA = wnativeBal.toString();
    const amountB = usdbBal.toString();

    const mintParamsIface =
      "tuple(uint256 fee, address tokenA, address tokenB, uint256 amountADesired, uint256 amountBDesired, uint256 amountAMin, uint256 amountBMin, address to, uint256 deadline) ThrusterV2SupplyData";

    const mintParams = {
      fee,
      tokenA,
      tokenB,
      amountADesired: amountA,
      amountBDesired: amountB,
      amountAMin: "1000",
      amountBMin: "1000",
      to: user.address,
      deadline: MaxUint256,
    };

    const thrusterData = defaultAbiCoder.encode(
      [mintParamsIface],
      [mintParams]
    );

    const tokens = [mintParams.tokenA, mintParams.tokenB];
    const amounts = [mintParams.amountADesired, mintParams.amountBDesired];

    await wnative.approve(batchTransaction.address, wnativeBal);
    await usdb.approve(batchTransaction.address, usdbBal);

    const lpBalBefore = await wethUsdbtLp.balanceOf(user.address);
    expect(lpBalBefore).eq(0);

    await batchTransaction.executeBatchCallsSameChain(
      0,
      tokens,
      amounts,
      [thrusterV2MintAdapter.address],
      [0],
      [2],
      [thrusterData],
      { gasLimit: 10000000 }
    );
    const lpBalAfter = await wethUsdbtLp.balanceOf(user.address);
    expect(lpBalAfter).gt(0);
  });

  it("Can mint a new position on Thruster V2 with fee 1%", async () => {
    const {
      batchTransaction,
      swapRouterFeePointThree,
      thrusterV2MintAdapter,
      pacMoon,
      wnative,
      wethPacmoonLp,
    } = await setupTests();

    await swapRouterFeePointThree.swapExactETHForTokens(
      "0",
      [wnative.address, pacMoon.address],
      deployer.address,
      ethers.constants.MaxUint256,
      { value: ethers.utils.parseEther("1") }
    );

    await wnative.deposit({ value: ethers.utils.parseEther("1") });
    const wnativeBal = await wnative.balanceOf(deployer.address);
    expect(wnativeBal).gt(0);

    const pacMoonBal = await pacMoon.balanceOf(deployer.address);
    expect(pacMoonBal).gt(0);

    const fee = "10000";
    const user = deployer;
    const tokenA = wnative.address;
    const tokenB = pacMoon.address;
    const amountA = wnativeBal.toString();
    const amountB = pacMoonBal.toString();

    const mintParamsIface =
      "tuple(uint256 fee, address tokenA, address tokenB, uint256 amountADesired, uint256 amountBDesired, uint256 amountAMin, uint256 amountBMin, address to, uint256 deadline) ThrusterV2SupplyData";

    const mintParams = {
      fee,
      tokenA,
      tokenB,
      amountADesired: amountA,
      amountBDesired: amountB,
      amountAMin: "1000",
      amountBMin: "1000",
      to: user.address,
      deadline: MaxUint256,
    };

    const thrusterData = defaultAbiCoder.encode(
      [mintParamsIface],
      [mintParams]
    );

    const tokens = [mintParams.tokenA, mintParams.tokenB];
    const amounts = [mintParams.amountADesired, mintParams.amountBDesired];

    await wnative.approve(batchTransaction.address, wnativeBal);
    await pacMoon.approve(batchTransaction.address, pacMoonBal);

    const lpBalBefore = await wethPacmoonLp.balanceOf(user.address);
    expect(lpBalBefore).eq(0);

    await batchTransaction.executeBatchCallsSameChain(
      0,
      tokens,
      amounts,
      [thrusterV2MintAdapter.address],
      [0],
      [2],
      [thrusterData],
      { gasLimit: 10000000 }
    );
    const lpBalAfter = await wethPacmoonLp.balanceOf(user.address);
    expect(lpBalAfter).gt(0);
  });
});
