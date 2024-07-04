import hardhat, { ethers, waffle } from "hardhat";
import { expect } from "chai";
import { defaultAbiCoder } from "ethers/lib/utils";
import { RPC } from "../constants";
import { DEXSPAN, DEFAULT_ENV } from "../../tasks/constants";
import { ThirdFySwap__factory } from "../../typechain/factories/ThirdFySwap__factory";
import { TokenInterface__factory } from "../../typechain/factories/TokenInterface__factory";
import { MockAssetForwarder__factory } from "../../typechain/factories/MockAssetForwarder__factory";
import { BatchTransaction__factory } from "../../typechain/factories/BatchTransaction__factory";
import { IWETH__factory } from "../../typechain/factories/IWETH__factory";
import { IThirdFySwapRouter__factory } from "../../typechain/factories/IThirdFySwapRouter__factory";
import { BigNumber, Contract, Wallet } from "ethers";
import { decodeExecutionEvent } from "../utils";
import { zeroAddress } from "ethereumjs-util";

const CHAIN_ID = "10242";
const THIRD_FY_SWAP_ROUTER = "0xd265f57c36AC60d3F7931eC5c7396966F0C246A7";
const LESS = "0xdc93F137EdfB14133686e90de9C845A7c7Fca3De";
const USDT = "0x6C45E28A76977a96e263f84F95912B47F927B687";
const USDC = "0x8C4aCd74Ff4385f3B7911432FA6787Aa14406f8B";
const NATIVE_TOKEN = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const WNATIVE = "0x69D349E2009Af35206EFc3937BaD6817424729F7";

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

describe("ThirdFySwap Adapter: ", async () => {
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
      THIRD_FY_SWAP_ROUTER,
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

    const ThirdFySwapAdapter = await ethers.getContractFactory("ThirdFySwap");
    const thirdFySwapAdapter = await ThirdFySwapAdapter.deploy(
      NATIVE_TOKEN,
      WNATIVE,
      THIRD_FY_SWAP_ROUTER
    );

    await batchTransaction.setAdapterWhitelist(
      [thirdFySwapAdapter.address],
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
      thirdFySwapAdapter: ThirdFySwap__factory.connect(
        thirdFySwapAdapter.address,
        deployer
      ),
      mockToken: TokenInterface__factory.connect(mockToken.address, deployer),
      mockAssetForwarder: MockAssetForwarder__factory.connect(
        mockAssetForwarder.address,
        deployer
      ),
      less: TokenInterface__factory.connect(LESS, deployer),
      usdt: TokenInterface__factory.connect(USDT, deployer),
      usdc: TokenInterface__factory.connect(USDC, deployer),
      wnative: IWETH__factory.connect(WNATIVE, deployer),
      swapRouter: IThirdFySwapRouter__factory.connect(
        THIRD_FY_SWAP_ROUTER,
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

  it("Can swap USDT for LESS on ThirdFy", async () => {
    const {
      batchTransaction,
      thirdFySwapAdapter,
      swapRouter,
      less,
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
      tokenOut: less.address,
      recipient: deployer.address,
      deadline: ethers.constants.MaxUint256,
      amountIn: amountIn,
      amountOutMinimum: "0",
      limitSqrtPrice: "0",
    };

    const swapParamsIface =
      "tuple(address tokenIn, address tokenOut, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 limitSqrtPrice) ExactInputSingleParams";

    const thirdFyData = defaultAbiCoder.encode([swapParamsIface], [swapParams]);

    const tokens = [swapParams.tokenIn];
    const amounts = [swapParams.amountIn];
    const feeInfo = [{ fee: 0, recipient: zeroAddress() }];

    await usdt.approve(batchTransaction.address, "500000000");

    const tx = await batchTransaction.executeBatchCallsSameChain(
      0,
      tokens,
      amounts,
      feeInfo,
      [thirdFySwapAdapter.address],
      [0],
      [2],
      [thirdFyData],
      { gasLimit: 10000000 }
    );

    const txReceipt = await tx.wait();

    const { data: thirdFyExecutionEventData } = decodeExecutionEvent(txReceipt);

    const lessBal = await less.balanceOf(deployer.address);
    expect(lessBal).gt(0);

    const thirdFyEventData = defaultAbiCoder.decode(
      [swapParamsIface, "uint256"],
      thirdFyExecutionEventData
    );

    expect(lessBal).eq(thirdFyEventData[1]);
  });
});
