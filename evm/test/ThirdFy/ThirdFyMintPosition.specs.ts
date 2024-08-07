import hardhat, { ethers, waffle } from "hardhat";
import { expect } from "chai";
import { defaultAbiCoder } from "ethers/lib/utils";
import { RPC } from "../constants";
import { DEXSPAN, DEFAULT_ENV } from "../../tasks/constants";
import { ThirdFyMint__factory } from "../../typechain/factories/ThirdFyMint__factory";
import { TokenInterface__factory } from "../../typechain/factories/TokenInterface__factory";
import { MockAssetForwarder__factory } from "../../typechain/factories/MockAssetForwarder__factory";
import { BatchTransaction__factory } from "../../typechain/factories/BatchTransaction__factory";
import { IWETH__factory } from "../../typechain/factories/IWETH__factory";
import { IThirdFyNonfungiblePositionManager__factory } from "../../typechain/factories/IThirdFyNonfungiblePositionManager__factory";
import { BigNumber, Contract, Wallet } from "ethers";
import { decodeExecutionEvent } from "../utils";
import { zeroAddress } from "ethereumjs-util";

const CHAIN_ID = "10242";
const THIRD_FY_POSITION_MANAGER = "0x0BFaCE9a5c9F884a4f09fadB83b69e81EA41424B";
const LESS = "0xdc93F137EdfB14133686e90de9C845A7c7Fca3De";
const USDT = "0x6C45E28A76977a96e263f84F95912B47F927B687";
const NATIVE_TOKEN = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const WNATIVE = "0x69D349E2009Af35206EFc3937BaD6817424729F7";
const SWAP_ROUTER = "0xd265f57c36AC60d3F7931eC5c7396966F0C246A7";

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

describe("ThirdFyMint Adapter: ", async () => {
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
      zeroAddress(),
      zeroAddress()
    );

    const ThirdFyMintPositionAdapter = await ethers.getContractFactory(
      "ThirdFyMint"
    );
    const thirdFyMintPositionAdapter = await ThirdFyMintPositionAdapter.deploy(
      NATIVE_TOKEN,
      WNATIVE,
      THIRD_FY_POSITION_MANAGER
    );

    await batchTransaction.setAdapterWhitelist(
      [thirdFyMintPositionAdapter.address],
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
      thirdFyMintPositionAdapter: ThirdFyMint__factory.connect(
        thirdFyMintPositionAdapter.address,
        deployer
      ),
      mockToken: TokenInterface__factory.connect(mockToken.address, deployer),
      mockAssetForwarder: MockAssetForwarder__factory.connect(
        mockAssetForwarder.address,
        deployer
      ),
      less: TokenInterface__factory.connect(LESS, deployer),
      usdt: TokenInterface__factory.connect(USDT, deployer),
      wnative: IWETH__factory.connect(WNATIVE, deployer),
      positionManager: IThirdFyNonfungiblePositionManager__factory.connect(
        THIRD_FY_POSITION_MANAGER,
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

  it("Can mint a new position on ThirdFy", async () => {
    const {
      batchTransaction,
      thirdFyMintPositionAdapter,
      positionManager,
      less,
      usdt,
      wnative,
      swapRouter,
    } = await setupTests();

    await wnative.deposit({ value: ethers.utils.parseEther("10") });
    await wnative.approve(SWAP_ROUTER, ethers.utils.parseEther("5"));

    await setUserTokenBalance(usdt, deployer, BigNumber.from("1000000000"));
    await usdt.approve(SWAP_ROUTER, "500000000");
    const usdtBal = await usdt.balanceOf(deployer.address);
    expect(usdtBal).gt(0);

    await swapRouter.exactInputSingleSupportingFeeOnTransferTokens({
      tokenIn: usdt.address,
      tokenOut: less.address,
      recipient: deployer.address,
      deadline: ethers.constants.MaxUint256,
      amountIn: "500000000",
      amountOutMinimum: "0",
      limitSqrtPrice: "0",
    });

    const lessBal = await less.balanceOf(deployer.address);
    expect(lessBal).gt(0);

    const user = deployer;
    // const chainId = CHAIN_ID;
    const token0 = usdt.address;
    const token1 = less.address;
    const amount0 = usdtBal.div(2).toString();
    const amount1 = lessBal.toString();

    const mintParams = {
      token0: token0,
      token1: token1,
      tickLower: "229200",
      tickUpper: "232080",
      amount0Desired: amount0,
      amount1Desired: amount1,
      amount0Min: "0",
      amount1Min: "0",
      recipient: user.address,
      deadline: ethers.constants.MaxUint256,
    };

    const mintParamsIface =
      "tuple(address token0, address token1, int24 tickLower, int24 tickUpper, uint256 amount0Desired, uint256 amount1Desired, uint256 amount0Min, uint256 amount1Min, address recipient, uint256 deadline) MintParams";

    const thirdFyData = defaultAbiCoder.encode([mintParamsIface], [mintParams]);

    const tokens = [mintParams.token0, mintParams.token1];
    const amounts = [mintParams.amount0Desired, mintParams.amount1Desired];
    const feeInfo = [
      { fee: 0, recipient: zeroAddress() },
      { fee: 0, recipient: zeroAddress() },
    ];

    if (mintParams.token0 === usdt.address) {
      await usdt.approve(batchTransaction.address, mintParams.amount0Desired);
      await less.approve(batchTransaction.address, mintParams.amount1Desired);
    } else {
      await less.approve(batchTransaction.address, mintParams.amount0Desired);
      await usdt.approve(batchTransaction.address, mintParams.amount1Desired);
    }

    const tx = await batchTransaction.executeBatchCallsSameChain(
      0,
      tokens,
      amounts,
      "",
      [thirdFyMintPositionAdapter.address],
      [0],
      [2],
      [thirdFyData],
      { gasLimit: 10000000 }
    );
    const txReceipt = await tx.wait();

    const { data: thirdFyExecutionEventData } = decodeExecutionEvent(txReceipt);

    const thirdFyEventData = defaultAbiCoder.decode(
      [mintParamsIface, "uint256"],
      thirdFyExecutionEventData
    );

    const position = await positionManager.positions(thirdFyEventData[1]);
    expect(position.token0).eq(mintParams.token0);
    expect(position.token1).eq(mintParams.token1);
  });
});
