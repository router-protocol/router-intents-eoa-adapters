import hardhat, { ethers, waffle } from "hardhat";
import { expect } from "chai";
import { defaultAbiCoder } from "ethers/lib/utils";
import { RPC } from "../constants";
import { DEXSPAN, DEFAULT_ENV } from "../../tasks/constants";
import { NuriMint__factory } from "../../typechain/factories/NuriMint__factory";
import { TokenInterface__factory } from "../../typechain/factories/TokenInterface__factory";
import { MockAssetForwarder__factory } from "../../typechain/factories/MockAssetForwarder__factory";
import { BatchTransaction__factory } from "../../typechain/factories/BatchTransaction__factory";
import { IWETH__factory } from "../../typechain/factories/IWETH__factory";
import { INuriNonfungiblePositionManager__factory } from "../../typechain/factories/INuriNonfungiblePositionManager__factory";
import { BigNumber, Contract, Wallet } from "ethers";
import { getNuriData } from "./utils";
import { decodeExecutionEvent } from "../utils";
import { zeroAddress } from "ethereumjs-util";

const CHAIN_ID = "534352";
const NURI_V3_POSITION_MANAGER = "0xAAA78E8C4241990B4ce159E105dA08129345946A";
const USDT = "0xf55bec9cafdbe8730f096aa55dad6d22d44099df";
const USDC = "0x06efdbff2a14a7c8e15944d1f4a48f9f95f663a4";
const NATIVE_TOKEN = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const WNATIVE = "0x5300000000000000000000000000000000000004";
const SWAP_ROUTER = "0xAAAE99091Fbb28D400029052821653C1C752483B";

const SWAP_ROUTER_ABI = [
  {
    inputs: [
      {
        components: [
          { internalType: "address", name: "tokenIn", type: "address" },
          { internalType: "address", name: "tokenOut", type: "address" },
          { internalType: "uint24", name: "fee", type: "uint24" },
          { internalType: "address", name: "recipient", type: "address" },
          { internalType: "uint256", name: "deadline", type: "uint256" },
          { internalType: "uint256", name: "amountIn", type: "uint256" },
          {
            internalType: "uint256",
            name: "amountOutMinimum",
            type: "uint256",
          },
          {
            internalType: "uint160",
            name: "sqrtPriceLimitX96",
            type: "uint160",
          },
        ],
        internalType: "struct ISwapRouter.ExactInputSingleParams",
        name: "params",
        type: "tuple",
      },
    ],
    name: "exactInputSingle",
    outputs: [{ internalType: "uint256", name: "amountOut", type: "uint256" }],
    stateMutability: "payable",
    type: "function",
  },
];

describe("NuriMint Adapter: ", async () => {
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

    const NuriMintPositionAdapter = await ethers.getContractFactory("NuriMint");
    const nuriMintPositionAdapter = await NuriMintPositionAdapter.deploy(
      NATIVE_TOKEN,
      WNATIVE,
      NURI_V3_POSITION_MANAGER
    );

    await batchTransaction.setAdapterWhitelist(
      [nuriMintPositionAdapter.address],
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
      nuriMintPositionAdapter: NuriMint__factory.connect(
        nuriMintPositionAdapter.address,
        deployer
      ),
      mockToken: TokenInterface__factory.connect(mockToken.address, deployer),
      mockAssetForwarder: MockAssetForwarder__factory.connect(
        mockAssetForwarder.address,
        deployer
      ),
      usdt: TokenInterface__factory.connect(USDT, deployer),
      wnative: IWETH__factory.connect(WNATIVE, deployer),
      positionManager: INuriNonfungiblePositionManager__factory.connect(
        NURI_V3_POSITION_MANAGER,
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

  it("Can mint a new position on NURI", async () => {
    const {
      batchTransaction,
      nuriMintPositionAdapter,
      positionManager,
      usdt,
      wnative,
      swapRouter,
    } = await setupTests();

    await wnative.deposit({ value: ethers.utils.parseEther("10") });
    // await setUserTokenBalance(usdt, deployer, ethers.utils.parseEther("1000"));

    await wnative.approve(SWAP_ROUTER, ethers.utils.parseEther("5"));

    await swapRouter.exactInputSingle({
      tokenIn: wnative.address,
      tokenOut: usdt.address,
      fee: "3000",
      recipient: deployer.address,
      deadline: ethers.constants.MaxUint256,
      amountIn: ethers.utils.parseEther("0.1"),
      amountOutMinimum: "0",
      sqrtPriceLimitX96: "0",
    });

    const usdtBal = await usdt.balanceOf(deployer.address);
    expect(usdtBal).gt(0);

    const user = deployer;
    const chainId = CHAIN_ID;
    const token1 = wnative.address;
    const token0 = usdt.address;
    const amount1 = ethers.utils.parseEther("0.1").toString();
    const amount0 = usdtBal.toString();
    const fee = 3000;

    const mintParams = await getNuriData({
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

    const NURIData = defaultAbiCoder.encode([mintParamsIface], [mintParams]);

    const tokens = [mintParams.token0, mintParams.token1];
    const amounts = [mintParams.amount0Desired, mintParams.amount1Desired];

    const feeInfo = [
      { fee: 0, recipient: zeroAddress() },
      { fee: 0, recipient: zeroAddress() },
    ];

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

    const tx = await batchTransaction.executeBatchCallsSameChain(
      0,
      tokens,
      amounts,
      feeInfo,
      [nuriMintPositionAdapter.address],
      [0],
      [2],
      [NURIData]
    );
    const txReceipt = await tx.wait();

    const { data: NURIExecutionEventData } = decodeExecutionEvent(txReceipt);

    const NURIEventData = defaultAbiCoder.decode(
      [mintParamsIface, "uint256"],
      NURIExecutionEventData
    );

    const position = await positionManager.positions(NURIEventData[1]);
    expect(position.token0).eq(mintParams.token0);
    expect(position.token1).eq(mintParams.token1);
    expect(position.fee).eq(mintParams.fee);
  });
});
