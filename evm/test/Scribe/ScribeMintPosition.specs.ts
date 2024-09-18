import hardhat, { ethers, waffle } from "hardhat";
import { expect } from "chai";
import { defaultAbiCoder } from "ethers/lib/utils";
import { RPC } from "../constants";
import { DEXSPAN, DEFAULT_ENV } from "../../tasks/constants";
import { ScribeMint__factory } from "../../typechain/factories/ScribeMint__factory";
import { TokenInterface__factory } from "../../typechain/factories/TokenInterface__factory";
import { MockAssetForwarder__factory } from "../../typechain/factories/MockAssetForwarder__factory";
import { BatchTransaction__factory } from "../../typechain/factories/BatchTransaction__factory";
import { IWETH__factory } from "../../typechain/factories/IWETH__factory";
import { IScribeNonfungiblePositionManager__factory } from "../../typechain/factories/IScribeNonfungiblePositionManager__factory";
import { BigNumber, Contract, Wallet } from "ethers";
import { decodeExecutionEvent } from "../utils";
import { zeroAddress } from "ethereumjs-util";

const CHAIN_ID = "534352";
const FEE_WALLET = "0x00EB64b501613F8Cf8Ef3Ac4F82Fc63a50343fee";
const SCRIBE_POSITION_MANAGER = "0x8b370dc23bE270a7FA78aD3803fCaAe549Ac21fc";
const USDT = "0xf55bec9cafdbe8730f096aa55dad6d22d44099df";
const USDC = "0x06efdbff2a14a7c8e15944d1f4a48f9f95f663a4";
const NATIVE_TOKEN = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const WNATIVE = "0x5300000000000000000000000000000000000004";
const SWAP_ROUTER = "0xB9D4EB6518A437b9a012aa3dA50b5CAE2439bc9D";

const SWAP_ROUTER_ABI = [
  {
    inputs: [
      {
        components: [
          { internalType: "address", name: "tokenIn", type: "address" },
          { internalType: "address", name: "tokenOut", type: "address" },
          { internalType: "address", name: "deployer", type: "address" },
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
            name: "limitSqrtPrice",
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

describe("ScribeMint Adapter: ", async () => {
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
    const FeeAdapter = await ethers.getContractFactory("FeeAdapter");
    const feeAdapter = await FeeAdapter.deploy(
      NATIVE_TOKEN,
      WNATIVE,
      FEE_WALLET,
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

    const ScribeMintPositionAdapter = await ethers.getContractFactory(
      "ScribeMint"
    );
    const scribeMintPositionAdapter = await ScribeMintPositionAdapter.deploy(
      NATIVE_TOKEN,
      WNATIVE,
      SCRIBE_POSITION_MANAGER
    );

    await batchTransaction.setAdapterWhitelist(
      [scribeMintPositionAdapter.address, feeAdapter.address],
      [true, true]
    );

    const MockToken = await ethers.getContractFactory("MockToken");
    const mockToken = await MockToken.deploy();
    await mockToken.mint(deployer.address, ethers.utils.parseEther("10000"));
    const FeeDataStoreAddress = await feeAdapter.feeDataStore();

    const FeeDataStoreContract = await ethers.getContractFactory(
      "FeeDataStore"
    );
    const feeDataStoreInstance =
      FeeDataStoreContract.attach(FeeDataStoreAddress);

    await feeDataStoreInstance.updateFeeWalletForAppId(
      [1],
      ["0xBec33ce33afdAF5604CCDF2c4b575238C5FBD23d"]
    );

    return {
      batchTransaction: BatchTransaction__factory.connect(
        batchTransaction.address,
        deployer
      ),
      scribeMintPositionAdapter: ScribeMint__factory.connect(
        scribeMintPositionAdapter.address,
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
      positionManager: IScribeNonfungiblePositionManager__factory.connect(
        SCRIBE_POSITION_MANAGER,
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

  it("Can mint a new position on Scribe", async () => {
    const {
      batchTransaction,
      scribeMintPositionAdapter,
      positionManager,
      usdc,
      usdt,
      wnative,
      swapRouter,
    } = await setupTests();

    await wnative.deposit({ value: ethers.utils.parseEther("10") });

    await wnative.approve(SWAP_ROUTER, ethers.utils.parseEther("10"));

    await swapRouter.exactInputSingle(
      {
        tokenIn: wnative.address,
        tokenOut: usdt.address,
        deployer: zeroAddress(),
        recipient: deployer.address,
        deadline: ethers.constants.MaxUint256,
        amountIn: ethers.utils.parseEther("0.1"),
        amountOutMinimum: "0",
        limitSqrtPrice: "0",
      },
      { gasLimit: 1000000 }
    );

    await swapRouter.exactInputSingle(
      {
        tokenIn: wnative.address,
        tokenOut: usdc.address,
        deployer: zeroAddress(),
        recipient: deployer.address,
        deadline: ethers.constants.MaxUint256,
        amountIn: ethers.utils.parseEther("0.1"),
        amountOutMinimum: "0",
        limitSqrtPrice: "0",
      },
      { gasLimit: 1000000 }
    );

    const usdcBal = await usdc.balanceOf(deployer.address);
    expect(usdcBal).gt(0);

    const usdtBal = await usdt.balanceOf(deployer.address);
    expect(usdtBal).gt(0);

    const user = deployer;
    const chainId = CHAIN_ID;
    const token0 = usdc.address;
    const token1 = wnative.address;
    const amount0 = usdcBal.toString();
    const amount1 = ethers.utils.parseEther("0.1").toString();

    const unit256Max = ethers.BigNumber.from(
      "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"
    );

    const mintParams = {
      token0: token0,
      token1: token1,
      deployer: zeroAddress(),
      tickLower: "-887220",
      tickUpper: "887220",
      amount0Desired: unit256Max,
      amount1Desired: unit256Max,
      amount0Min: "0",
      amount1Min: "0",
      recipient: user.address,
      deadline: "1726632604269",
    };

    const mintParamsIface =
      "tuple(address token0, address token1, address deployer, int24 tickLower, int24 tickUpper, uint256 amount0Desired, uint256 amount1Desired, uint256 amount0Min, uint256 amount1Min, address recipient, uint256 deadline) MintParams";

    const scribeData = defaultAbiCoder.encode([mintParamsIface], [mintParams]);

    const tokens = [mintParams.token0, mintParams.token1];
    const amounts = [amount0, amount1];

    if (mintParams.token0 === wnative.address) {
      await wnative.approve(batchTransaction.address, mintParams.amount0Desired);
      await usdc.approve(batchTransaction.address, mintParams.amount1Desired);
    } else {
      await usdc.approve(batchTransaction.address, mintParams.amount0Desired);
      await wnative.approve(batchTransaction.address, mintParams.amount1Desired);
    }

    const appId = ["1"];
    const fee = ["0"];

    const feeData = defaultAbiCoder.encode(
      ["uint256[]", "uint96[]", "address[]", "uint256[]", "bool"],
      [appId, fee, tokens, amounts, true]
    );

    const targets = [scribeMintPositionAdapter.address];
    const data = [scribeData];
    const value = [0];
    const callType = [2];
    
    const handlerBalancerBefore = await wnative.balanceOf(FEE_WALLET);

    const tx = await batchTransaction.executeBatchCallsSameChain(
      0,
      tokens,
      amounts,
      feeData,
      targets,
      value,
      callType,
      data,
      { gasLimit: 10000000 }
    );
    const txReceipt = await tx.wait();

    const handlerBalancerAfter = await wnative.balanceOf(FEE_WALLET);

    expect(handlerBalancerAfter).gt(handlerBalancerBefore);

    const { data: scribeExecutionEventData } = decodeExecutionEvent(txReceipt);

    const scribeEventData = defaultAbiCoder.decode(
      [mintParamsIface, "uint256"],
      scribeExecutionEventData
    );

    const position = await positionManager.positions(scribeEventData[1]);
    expect(position.token0.toLowerCase()).eq(mintParams.token0);
    expect(position.token1.toLowerCase()).eq(mintParams.token1);
  });
});
