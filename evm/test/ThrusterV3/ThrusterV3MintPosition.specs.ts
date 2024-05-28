import hardhat, { ethers, waffle } from "hardhat";
import { expect } from "chai";
import { defaultAbiCoder } from "ethers/lib/utils";
import { RPC } from "../constants";
import { DEXSPAN, DEFAULT_ENV } from "../../tasks/constants";
import { ThrusterV3Mint__factory } from "../../typechain/factories/ThrusterV3Mint__factory";
import { TokenInterface__factory } from "../../typechain/factories/TokenInterface__factory";
import { MockAssetForwarder__factory } from "../../typechain/factories/MockAssetForwarder__factory";
import { BatchTransaction__factory } from "../../typechain/factories/BatchTransaction__factory";
import { IWETH__factory } from "../../typechain/factories/IWETH__factory";
import { INonfungiblePositionManager__factory } from "../../typechain/factories/INonfungiblePositionManager__factory";
import { getMintData } from "./utils";
import { decodeExecutionEvent } from "../utils";
import { THRUSTER_NON_FUNGIBLE_POSITION_MANAGER } from "../../tasks/deploy/thrusterV3/constants";
import { THRUSTER_V2_ROUTER_FEE_POINT_THREE } from "../../tasks/deploy/thrusterV2/constants";

const CHAIN_ID = "81457";
const NATIVE_TOKEN = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const WNATIVE = "0x4300000000000000000000000000000000000004";
const USDB = "0x4300000000000000000000000000000000000003";
const WETH_USDB_POOL = "0xf00DA13d2960Cf113edCef6e3f30D92E52906537";

const SWAP_ROUTER_ABI = [
  "function swapExactETHForTokens(uint256 amountOutMin, address[] calldata path, address to, uint256 deadline) external payable returns (uint256[] memory amounts)",
];

describe("ThrusterV3Mint Adapter: ", async () => {
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

    const swapRouterFeePointThree = new ethers.Contract(
      THRUSTER_V2_ROUTER_FEE_POINT_THREE[CHAIN_ID],
      SWAP_ROUTER_ABI,
      deployer
    );

    const batchTransaction = await BatchTransaction.deploy(
      NATIVE_TOKEN,
      WNATIVE,
      mockAssetForwarder.address,
      DEXSPAN[env][CHAIN_ID]
    );

    const ThrusterV3MintPositionAdapter = await ethers.getContractFactory(
      "ThrusterV3Mint"
    );
    const thrusterV3MintPositionAdapter =
      await ThrusterV3MintPositionAdapter.deploy(
        NATIVE_TOKEN,
        WNATIVE,
        THRUSTER_NON_FUNGIBLE_POSITION_MANAGER[CHAIN_ID]
      );

    await batchTransaction.setAdapterWhitelist(
      [thrusterV3MintPositionAdapter.address],
      [true]
    );

    return {
      batchTransaction: BatchTransaction__factory.connect(
        batchTransaction.address,
        deployer
      ),
      thrusterV3MintPositionAdapter: ThrusterV3Mint__factory.connect(
        thrusterV3MintPositionAdapter.address,
        deployer
      ),
      mockAssetForwarder: MockAssetForwarder__factory.connect(
        mockAssetForwarder.address,
        deployer
      ),
      swapRouterFeePointThree,
      usdb: TokenInterface__factory.connect(USDB, deployer),
      wnative: IWETH__factory.connect(WNATIVE, deployer),
      positionManager: INonfungiblePositionManager__factory.connect(
        THRUSTER_NON_FUNGIBLE_POSITION_MANAGER[CHAIN_ID],
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

  it("Can mint a new position on Thruster V3", async () => {
    const {
      batchTransaction,
      thrusterV3MintPositionAdapter,
      swapRouterFeePointThree,
      positionManager,
      usdb,
      wnative,
    } = await setupTests();

    await swapRouterFeePointThree.swapExactETHForTokens(
      "0",
      [wnative.address, usdb.address],
      deployer.address,
      ethers.constants.MaxUint256,
      { value: ethers.utils.parseEther("1") }
    );
    const usdbBal = await usdb.balanceOf(deployer.address);
    expect(usdbBal).gt(0);

    await wnative.deposit({ value: ethers.utils.parseEther("1") });

    const user = deployer;
    const chainId = CHAIN_ID;
    const token0 = wnative.address;
    const token1 = usdb.address;
    const amount0 = ethers.utils.parseEther("0.1").toString();
    const amount1 = usdbBal.div(10).toString();
    const fee = 3000;

    const mintParams = await getMintData({
      poolAddress: WETH_USDB_POOL,
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

    const thrusterData = defaultAbiCoder.encode(
      [mintParamsIface],
      [mintParams]
    );

    const tokens = [mintParams.token0, mintParams.token1];
    const amounts = [mintParams.amount0Desired, mintParams.amount1Desired];

    if (mintParams.token0 === wnative.address) {
      await wnative.approve(
        batchTransaction.address,
        mintParams.amount0Desired
      );
      await usdb.approve(batchTransaction.address, mintParams.amount1Desired);
    } else {
      await usdb.approve(batchTransaction.address, mintParams.amount0Desired);
      await wnative.approve(
        batchTransaction.address,
        mintParams.amount1Desired
      );
    }

    const tx = await batchTransaction.executeBatchCallsSameChain(
      0,
      tokens,
      amounts,
      [thrusterV3MintPositionAdapter.address],
      [0],
      [2],
      [thrusterData]
    );
    const txReceipt = await tx.wait();

    const { data: thrusterExecutionEventData } =
      decodeExecutionEvent(txReceipt);

    const thrusterEventData = defaultAbiCoder.decode(
      [mintParamsIface, "uint256"],
      thrusterExecutionEventData
    );

    const position = await positionManager.positions(thrusterEventData[1]);
    expect(position.token0).eq(mintParams.token0);
    expect(position.token1).eq(mintParams.token1);
    expect(position.fee).eq(mintParams.fee);
  });
});
