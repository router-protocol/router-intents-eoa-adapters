import hardhat, { ethers, waffle } from "hardhat";
import { expect } from "chai";
import { defaultAbiCoder } from "ethers/lib/utils";
import { RPC } from "../constants";
import { DEXSPAN, DEFAULT_ENV } from "../../tasks/constants";
import { AgniMint__factory } from "../../typechain/factories/AgniMint__factory";
import { TokenInterface__factory } from "../../typechain/factories/TokenInterface__factory";
import { MockAssetForwarder__factory } from "../../typechain/factories/MockAssetForwarder__factory";
import { BatchTransaction__factory } from "../../typechain/factories/BatchTransaction__factory";
import { IWETH__factory } from "../../typechain/factories/IWETH__factory";
import { IAgniPositionManager__factory } from "../../typechain/factories/IAgniPositionManager__factory";
import { BigNumber, Contract, Wallet } from "ethers";
import { getAgniData } from "./utils";
import { decodeExecutionEvent } from "../utils";
import { zeroAddress } from "ethereumjs-util";
import { AgniRouterAbi } from "./AgniRouterAbi";
const CHAIN_ID = "5000";
const AGNI_V3_POSITION_MANAGER = "0x218bf598D1453383e2F4AA7b14fFB9BfB102D637";
const USDT = "0x201EBa5CC46D216Ce6DC03F6a759e8E766e956aE";
const USDC = "0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9";
const NATIVE_TOKEN = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
const WNATIVE = "0x78c1b0C915c4FAA5FffA6CAbf0219DA63d7f4cb8";
const AGNI_ROUTER = "0x319B69888b0d11cEC22caA5034e25FfFBDc88421";

describe("AgniMint Adapter: ", async () => {
  const [deployer] = waffle.provider.getWallets();

  const setupTests = async () => {
    let env = process.env.ENV;
    if (!env) env = DEFAULT_ENV;

    const swapRouter = new ethers.Contract(
      AGNI_ROUTER,
      AgniRouterAbi,
      deployer
    );

    const MockAssetForwarder = await ethers.getContractFactory(
      "MockAssetForwarder"
    );
    const mockAssetForwarder = await MockAssetForwarder.deploy();

    const FeeAdapter = await ethers.getContractFactory("FeeAdapter");
    const feeAdapter = await FeeAdapter.deploy(
      NATIVE_TOKEN,
      WNATIVE,
      deployer.address,
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

    const AgniMintPositionAdapter = await ethers.getContractFactory("AgniMint");
    const agniMintPositionAdapter = await AgniMintPositionAdapter.deploy(
      NATIVE_TOKEN,
      WNATIVE,
      AGNI_V3_POSITION_MANAGER
    );

    await batchTransaction.setAdapterWhitelist(
      [agniMintPositionAdapter.address],
      [true]
    );

    const isAdapterWhiteListed = await batchTransaction.isAdapterWhitelisted(
      agniMintPositionAdapter.address
    );

    const MockToken = await ethers.getContractFactory("MockToken");
    const mockToken = await MockToken.deploy();
    await mockToken.mint(deployer.address, ethers.utils.parseEther("10000"));

    return {
      batchTransaction: BatchTransaction__factory.connect(
        batchTransaction.address,
        deployer
      ),
      agniMintPositionAdapter: AgniMint__factory.connect(
        agniMintPositionAdapter.address,
        deployer
      ),
      mockToken: TokenInterface__factory.connect(mockToken.address, deployer),
      mockAssetForwarder: MockAssetForwarder__factory.connect(
        mockAssetForwarder.address,
        deployer
      ),
      usdt: TokenInterface__factory.connect(USDT, deployer),
      wnative: IWETH__factory.connect(WNATIVE, deployer),
      positionManager: IAgniPositionManager__factory.connect(
        AGNI_V3_POSITION_MANAGER,
        deployer
      ),
      swapRouter,
      usdc: TokenInterface__factory.connect(USDC, deployer),
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

  it("Can mint a new position on AGNI", async () => {
    const {
      batchTransaction,
      agniMintPositionAdapter,
      positionManager,
      usdt,
      wnative,
      swapRouter,
    } = await setupTests();

    await wnative.deposit({ value: ethers.utils.parseEther("10") });
    await setUserTokenBalance(usdt, deployer, ethers.utils.parseEther("1000"));

    await wnative.approve(AGNI_ROUTER, ethers.utils.parseEther("5"));

    const swaperInputData = {
      tokenIn: wnative.address,
      tokenOut: usdt.address,
      fee: 100,
      recipient: deployer.address,
      deadline: ethers.constants.MaxUint256.toString(),
      amountIn: ethers.utils.parseEther("0.1").toBigInt(),
      amountOutMinimum: "0",
      limitSqrtPrice: "0",
    };
    const encodedMessageSwapper = defaultAbiCoder.encode(
      [
        "address",
        "address",
        "uint24",
        "address",
        "uint256",
        "uint256",
        "uint256",
        "uint160",
      ],
      [
        swaperInputData.tokenIn,
        swaperInputData.tokenOut,
        swaperInputData.fee,
        swaperInputData.recipient,
        swaperInputData.deadline,
        swaperInputData.amountIn,
        swaperInputData.amountOutMinimum,
        swaperInputData.limitSqrtPrice,
      ]
    );
    // const xx = await swapRouter.exactInputSingle({
    //   tokenIn: wnative.address,
    //   tokenOut: usdt.address,
    //   fee: 100,
    //   recipient: deployer.address,
    //   deadline: ethers.constants.MaxUint256.toString(),
    //   amountIn: ethers.utils.parseEther("0.1").toBigInt(),
    //   amountOutMinimum: "0",
    //   limitSqrtPrice: "0",
    // });

    // await usdt.deposit({ value: ethers.utils.parseEther("10") });
    // // await setUserTokenBalance(usdt, deployer, ethers.utils.parseEther("1000"));

    await usdt.approve(AGNI_ROUTER, ethers.utils.parseEther("5"));

    const usdtBal = await usdt.balanceOf(deployer.address);
    expect(usdtBal).gt(0);

    const user = deployer;
    const chainId = CHAIN_ID;
    const token1 = wnative.address;
    const token0 = usdt.address;
    const amount1 = ethers.utils.parseEther("0.1").toString();
    const amount0 = usdtBal.toString();
    const fee = 100;

    const mintParams = await getAgniData({
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

    const AgniData = defaultAbiCoder.encode([mintParamsIface], [mintParams]);

    const tokens = [mintParams.token0, mintParams.token1];
    const amounts = [mintParams.amount0Desired, mintParams.amount1Desired];

    if (mintParams.token0 === wnative.address) {
      await wnative.approve(
        batchTransaction.address,
        mintParams.amount0Desired
      );
      await usdt.approve(batchTransaction.address, mintParams.amount1Desired);
    } else {
      await usdt.approve(batchTransaction.address, mintParams.amount0Desired);
      await wnative.approve(
        batchTransaction.address,
        mintParams.amount1Desired
      );
    }

    const feeX = ["0"];
    const feeData = defaultAbiCoder.encode(
      ["uint256[]", "uint96[]", "address[]", "uint256[]", "bool"],
      [[0], feeX, tokens, amounts, false]
    );

    const tx = await batchTransaction.executeBatchCallsSameChain(
      0,
      tokens,
      amounts,
      feeData,
      [agniMintPositionAdapter.address],
      [0],
      [2],
      [AgniData]
    );
    const txReceipt = await tx.wait();

    const { data: AgniExecutionEventData } = decodeExecutionEvent(txReceipt);

    const AgniEventData = defaultAbiCoder.decode(
      [mintParamsIface, "uint256"],
      AgniExecutionEventData
    );

    const position = await positionManager.positions(AgniEventData[1]);
    expect(position.token0).eq(mintParams.token0);
    expect(position.token1).eq(mintParams.token1);
    expect(position.fee).eq(mintParams.fee);
  });
});
