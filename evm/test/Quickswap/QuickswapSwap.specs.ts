import hardhat, { ethers, waffle } from "hardhat";
import { expect } from "chai";
import { defaultAbiCoder } from "ethers/lib/utils";
import { RPC } from "../constants";
import { DEXSPAN, DEFAULT_ENV } from "../../tasks/constants";
import { QuickswapSwap__factory } from "../../typechain/factories/QuickswapSwap__factory";
import { TokenInterface__factory } from "../../typechain/factories/TokenInterface__factory";
import { MockAssetForwarder__factory } from "../../typechain/factories/MockAssetForwarder__factory";
import { BatchTransaction__factory } from "../../typechain/factories/BatchTransaction__factory";
import { IWETH__factory } from "../../typechain/factories/IWETH__factory";
import { IQuickswapSwapRouter__factory } from "../../typechain/factories/IQuickswapSwapRouter__factory";
import { BigNumber, Contract, Wallet } from "ethers";
import { decodeExecutionEvent } from "../utils";
import { zeroAddress } from "ethereumjs-util";

const CHAIN_ID = "196";
const QUICK_SWAP_ROUTER = "0x4B9f4d2435Ef65559567e5DbFC1BbB37abC43B57";
const USDT = "0x1e4a5963abfd975d8c9021ce480b42188849d41d";
const USDC = "0x74b7f16337b8972027f6196a17a631ac6de26d22";
const NATIVE_TOKEN = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const WNATIVE = "0xe538905cf8410324e03a5a23c1c177a474d59b2b";

const SWAP_ROUTER_ABI = [
  {
    inputs: [
      {
        components: [
          {
            internalType: "address",
            name: "tokenIn",
            type: "address",
          },
          {
            internalType: "address",
            name: "tokenOut",
            type: "address",
          },
          {
            internalType: "address",
            name: "recipient",
            type: "address",
          },
          {
            internalType: "uint256",
            name: "deadline",
            type: "uint256",
          },
          {
            internalType: "uint256",
            name: "amountIn",
            type: "uint256",
          },
          {
            internalType: "uint256",
            name: "amountOutMinimum",
            type: "uint256",
          },
          {
            internalType: "uint160",
            name: "limitSqrtPrice",
            type: "uint160",
          },
        ],
        internalType: "struct ISwapRouter.ExactInputSingleParams",
        name: "params",
        type: "tuple",
      },
    ],
    name: "exactInputSingleSupportingFeeOnTransferTokens",
    outputs: [
      {
        internalType: "uint256",
        name: "amountOut",
        type: "uint256",
      },
    ],
    stateMutability: "payable",
    type: "function",
  },
];

describe("QuickswapSwap Adapter: ", async () => {
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
    
    const swapRouter = new ethers.Contract(
      QUICK_SWAP_ROUTER,
      SWAP_ROUTER_ABI,
      deployer
    );
    
    const batchTransaction = await BatchTransaction.deploy(
      NATIVE_TOKEN,
      WNATIVE,
      mockAssetForwarder.address,
      DEXSPAN[env][CHAIN_ID],
      zeroAddress()
    );

    const QuickswapSwapAdapter = await ethers.getContractFactory("QuickswapSwap");
    const quickswapSwapAdapter = await QuickswapSwapAdapter.deploy(
      NATIVE_TOKEN,
      WNATIVE,
      QUICK_SWAP_ROUTER
    );

    await batchTransaction.setAdapterWhitelist(
      [quickswapSwapAdapter.address],
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
      quickswapSwapAdapter: QuickswapSwap__factory.connect(
        quickswapSwapAdapter.address,
        deployer
      ),
      mockToken: TokenInterface__factory.connect(mockToken.address, deployer),
      mockAssetForwarder: MockAssetForwarder__factory.connect(
        mockAssetForwarder.address,
        deployer
      ),
      usdt: TokenInterface__factory.connect(USDT, deployer),
      usdc: TokenInterface__factory.connect(USDC, deployer),
      wnative: IWETH__factory.connect(WNATIVE, deployer),
      swapRouter: IQuickswapSwapRouter__factory.connect(
        QUICK_SWAP_ROUTER,
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

  it("Can swap USDT for USDC on quickswap", async () => {
    const {
      batchTransaction,
      quickswapSwapAdapter,
      swapRouter,
      usdc,
      usdt,
      wnative,
    } = await setupTests();

    await wnative.deposit({ value: ethers.utils.parseEther("10") });

    await setUserTokenBalance(usdt, deployer, BigNumber.from("1000000000"));

    const usdtBal = await usdt.balanceOf(deployer.address);
    expect(usdtBal).gt(0);

    const user = deployer;
    const chainId = CHAIN_ID;
    const tokenIn = usdt.address;
    const amountIn = usdtBal.div(2).toString();

    const swapParams = {
      tokenIn: usdt.address,
      tokenOut: usdc.address,
      recipient: deployer.address,
      deadline: ethers.constants.MaxUint256,
      amountIn: amountIn,
      amountOutMinimum: "0",
      limitSqrtPrice: "0",
    };

    const swapParamsIface =
      "tuple(address tokenIn, address tokenOut, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 limitSqrtPrice) ExactInputSingleParams";

    const quickswapData = defaultAbiCoder.encode([swapParamsIface], [swapParams]);

    const tokens = [swapParams.tokenIn];
    const amounts = [swapParams.amountIn];
    const feeInfo = [{ fee: 0, recipient: zeroAddress() }];

    await usdt.approve(batchTransaction.address, "500000000");

    const tx = await batchTransaction.executeBatchCallsSameChain(
      0,
      tokens,
      amounts,
      feeInfo,
      [quickswapSwapAdapter.address],
      [0],
      [2],
      [quickswapData],
      { gasLimit: 10000000 }
    );

    const txReceipt = await tx.wait();

    const { data: quickswapExecutionEventData } = decodeExecutionEvent(txReceipt);

    const usdcBal = await usdc.balanceOf(deployer.address);
    expect(usdcBal).gt(0);

    const quickswapEventData = defaultAbiCoder.decode(
      [swapParamsIface, "uint256"],
      quickswapExecutionEventData
    );

    expect(usdcBal).eq(quickswapEventData[1]);
  });
});
