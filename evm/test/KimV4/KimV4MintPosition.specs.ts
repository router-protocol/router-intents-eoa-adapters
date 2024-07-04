import hardhat, { ethers, waffle } from "hardhat";
import { expect } from "chai";
import { defaultAbiCoder } from "ethers/lib/utils";
import { RPC } from "../constants";
import { DEXSPAN, DEFAULT_ENV } from "../../tasks/constants";
import { KimV4Mint__factory } from "../../typechain/factories/KimV4Mint__factory";
import { TokenInterface__factory } from "../../typechain/factories/TokenInterface__factory";
import { MockAssetForwarder__factory } from "../../typechain/factories/MockAssetForwarder__factory";
import { BatchTransaction__factory } from "../../typechain/factories/BatchTransaction__factory";
import { IWETH__factory } from "../../typechain/factories/IWETH__factory";
import { IKimNonfungiblePositionManager__factory } from "../../typechain/factories/IKimNonfungiblePositionManager__factory";
import { BigNumber, Contract, Wallet } from "ethers";
import { decodeExecutionEvent } from "../utils";
import { zeroAddress } from "ethereumjs-util";

const CHAIN_ID = "34443";
const KIM_V4_POSITION_MANAGER = "0x2e8614625226D26180aDf6530C3b1677d3D7cf10";
const USDC = "0xd988097fb8612cc24eeC14542bC03424c656005f";
const USDT = "0xf0F161fDA2712DB8b566946122a5af183995e2eD";
const NATIVE_TOKEN = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const WNATIVE = "0x4200000000000000000000000000000000000006";
const SWAP_ROUTER = "0x5D61c537393cf21893BE619E36fC94cd73C77DD3";

const SWAP_ROUTER_ABI = [
  "function swapExactETHForTokensSupportingFeeOnTransferTokens(uint amountOutMin, address[] calldata path, address to, address referrer, uint deadline) external payable",
];

describe("KimV4Mint Adapter: ", async () => {
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

    const KimV4MintPositionAdapter = await ethers.getContractFactory(
      "KimV4Mint"
    );
    const kimV4MintPositionAdapter = await KimV4MintPositionAdapter.deploy(
      NATIVE_TOKEN,
      WNATIVE,
      KIM_V4_POSITION_MANAGER
    );

    await batchTransaction.setAdapterWhitelist(
      [kimV4MintPositionAdapter.address],
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
      kimV4MintPositionAdapter: KimV4Mint__factory.connect(
        kimV4MintPositionAdapter.address,
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
      positionManager: IKimNonfungiblePositionManager__factory.connect(
        KIM_V4_POSITION_MANAGER,
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
            blockNumber: 6550449,
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

  it("Can mint a new position on Kim V4", async () => {
    const {
      batchTransaction,
      kimV4MintPositionAdapter,
      positionManager,
      usdc,
      usdt,
      wnative,
      swapRouter,
    } = await setupTests();

    await wnative.deposit({ value: ethers.utils.parseEther("10") });

    await swapRouter.swapExactETHForTokensSupportingFeeOnTransferTokens(
      "0",
      [wnative.address, usdc.address],
      deployer.address,
      deployer.address,
      ethers.constants.MaxUint256,
      { value: ethers.utils.parseEther("1") }
    );
    await swapRouter.swapExactETHForTokensSupportingFeeOnTransferTokens(
      "0",
      [wnative.address, usdc.address, usdt.address],
      deployer.address,
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
    const token0 = usdc.address;
    const token1 = usdt.address;
    const amount0 = usdcBal.toString();
    const amount1 = usdtBal.toString();

    const mintParams = {
      token0: token0,
      token1: token1,
      tickLower: "-540",
      tickUpper: "960",
      amount0Desired: amount0,
      amount1Desired: amount1,
      amount0Min: "0",
      amount1Min: "0",
      recipient: user.address,
      deadline: ethers.constants.MaxUint256,
    };

    const mintParamsIface =
      "tuple(address token0, address token1, int24 tickLower, int24 tickUpper, uint256 amount0Desired, uint256 amount1Desired, uint256 amount0Min, uint256 amount1Min, address recipient, uint256 deadline) MintParams";

    const kimV4Data = defaultAbiCoder.encode([mintParamsIface], [mintParams]);

    const tokens = [mintParams.token0, mintParams.token1];
    const amounts = [mintParams.amount0Desired, mintParams.amount1Desired];

    if (mintParams.token0 === usdt.address) {
      await usdt.approve(batchTransaction.address, mintParams.amount0Desired);
      await usdc.approve(batchTransaction.address, mintParams.amount1Desired);
    } else {
      await usdc.approve(batchTransaction.address, mintParams.amount0Desired);
      await usdt.approve(batchTransaction.address, mintParams.amount1Desired);
    }

    const feeInfo = [
      { fee: 0, recipient: zeroAddress() },
      { fee: 0, recipient: zeroAddress() },
    ];

    const tx = await batchTransaction.executeBatchCallsSameChain(
      0,
      tokens,
      amounts,
      feeInfo,
      [kimV4MintPositionAdapter.address],
      [0],
      [2],
      [kimV4Data],
      { gasLimit: 10000000 }
    );
    const txReceipt = await tx.wait();

    const { data: kimV4ExecutionEventData } = decodeExecutionEvent(txReceipt);

    const kimV4EventData = defaultAbiCoder.decode(
      [mintParamsIface, "uint256"],
      kimV4ExecutionEventData
    );

    const position = await positionManager.positions(kimV4EventData[1]);
    expect(position.token0).eq(mintParams.token0);
    expect(position.token1).eq(mintParams.token1);
  });
});
