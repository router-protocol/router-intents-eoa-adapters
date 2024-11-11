import hardhat, { ethers, waffle } from "hardhat";
import { expect } from "chai";
import { defaultAbiCoder } from "ethers/lib/utils";
import { RPC } from "../constants";
import { DEXSPAN, DEFAULT_ENV } from "../../tasks/constants";
import { ThenaMint__factory } from "../../typechain/factories/ThenaMint__factory";
import { TokenInterface__factory } from "../../typechain/factories/TokenInterface__factory";
import { MockAssetForwarder__factory } from "../../typechain/factories/MockAssetForwarder__factory";
import { BatchTransaction__factory } from "../../typechain/factories/BatchTransaction__factory";
import { IWETH__factory } from "../../typechain/factories/IWETH__factory";
import { IThenaNonfungiblePositionManager__factory } from "../../typechain/factories/IThenaNonfungiblePositionManager__factory";
import { BigNumber, Contract, Wallet } from "ethers";
import { getTransaction, decodeExecutionEvent } from "../utils";
import { zeroAddress } from "ethereumjs-util";
import { MaxUint256 } from "@ethersproject/constants";

const CHAIN_ID = "56";
const THENA_POSITION_MANAGER = "0xa51ADb08Cbe6Ae398046A23bec013979816B77Ab";
const FEE_WALLET = "0x00EB64b501613F8Cf8Ef3Ac4F82Fc63a50343fee";
const USDT = "0x55d398326f99059fF775485246999027B3197955";
const USDC = "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d";
const NATIVE_TOKEN = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const WNATIVE = "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c";
const SWAP_ROUTER = "0x327Dd3208f0bCF590A66110aCB6e5e6941A4EfA0";

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

describe("ThenaMint Adapter: ", async () => {
  const [deployer] = waffle.provider.getWallets();

  const setupTests = async () => {
    let env = process.env.ENV;
    if (!env) env = DEFAULT_ENV;

    const swapRouter = new ethers.Contract(
      SWAP_ROUTER,
      SWAP_ROUTER_ABI,
      deployer
    );
    const FeeAdapter = await ethers.getContractFactory("FeeAdapter");
    const feeAdapter = await FeeAdapter.deploy(
      NATIVE_TOKEN,
      WNATIVE,
      FEE_WALLET,
      5
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
      feeAdapter.address
    );

    const ThenaMintPositionAdapter = await ethers.getContractFactory(
      "ThenaMint"
    );
    const thenaMintPositionAdapter = await ThenaMintPositionAdapter.deploy(
      NATIVE_TOKEN,
      WNATIVE,
      THENA_POSITION_MANAGER
    );

    await batchTransaction.setAdapterWhitelist(
      [thenaMintPositionAdapter.address, feeAdapter.address],
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
      thenaMintPositionAdapter: ThenaMint__factory.connect(
        thenaMintPositionAdapter.address,
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
      positionManager: IThenaNonfungiblePositionManager__factory.connect(
        THENA_POSITION_MANAGER,
        deployer
      ),
      // swapRouter,
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
      [user.address, 1] // key, slot
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

  it("Can mint a new position on Thena", async () => {
    const {
      batchTransaction,
      thenaMintPositionAdapter,
      positionManager,
      usdt,
      wnative,
      usdc,
    } = await setupTests();

    await wnative.deposit({ value: ethers.utils.parseEther("10") });
    // await wnative.approve(SWAP_ROUTER, ethers.utils.parseEther("5"));
    const wNativeBalBefore = await wnative.balanceOf(deployer.address);
    // await swapRouter.exactInputSingleSupportingFeeOnTransferTokens({
    //   tokenIn: wnative.address,
    //   tokenOut: usdt.address,
    //   recipient: deployer.address,
    //   deadline: ethers.constants.MaxUint256,
    //   amountIn: ethers.utils.parseEther("0.1"),
    //   amountOutMinimum: "0",
    //   limitSqrtPrice: "0",
    // });

    const txn = await getTransaction({
      fromTokenAddress: WNATIVE,
      toTokenAddress: USDC,
      amount: ethers.utils.parseEther("0.1").toString(),
      fromTokenChainId: CHAIN_ID,
      toTokenChainId: CHAIN_ID,
      senderAddress: deployer.address,
      receiverAddress: deployer.address,
    });
    await wnative.approve(txn.to, ethers.utils.parseEther("0.5").toString());
    await deployer.sendTransaction({
      to: txn.to,
      value: txn.value,
      data: txn.data,
      gasLimit: txn.gasLimit,
      gasPrice: txn.gasPrice,
    });
    await setUserTokenBalance(usdt, deployer, ethers.utils.parseEther("70"));

    // const txn2 = await getTransaction({
    //   fromTokenAddress: WNATIVE,
    //   toTokenAddress: USDT,
    //   amount: ethers.utils.parseEther("0.1").toString(),
    //   fromTokenChainId: CHAIN_ID,
    //   toTokenChainId: CHAIN_ID,
    //   senderAddress: deployer.address,
    //   receiverAddress: deployer.address,
    // });
    // await deployer.sendTransaction({
    //   to: txn.to,
    //   value: txn.value,
    //   data: txn.data,
    //   gasLimit: txn.gasLimit,
    //   gasPrice: txn.gasPrice,
    // });

    const usdtBal = await usdt.balanceOf(deployer.address);
    const usdcBal = await usdc.balanceOf(deployer.address);
    expect(usdtBal).gt(0);
    expect(usdcBal).gt(0);

    const user = deployer;
    const chainId = CHAIN_ID;
    const token0 = usdt.address;
    const token1 = usdc.address;
    const amount0 = usdtBal.toString();
    const amount1 = usdcBal.toString();
    const mintParams = {
      token0: token0,
      token1: token1,
      tickLower: "-65520",
      tickUpper: "-62640",
      amount0Desired: ethers.constants.MaxUint256,
      amount1Desired: ethers.constants.MaxUint256,
      amount0Min: "0",
      amount1Min: "0",
      recipient: user.address,
      deadline: ethers.constants.MaxUint256,
    };

    const mintParamsIface =
      "tuple(address token0, address token1, int24 tickLower, int24 tickUpper, uint256 amount0Desired, uint256 amount1Desired, uint256 amount0Min, uint256 amount1Min, address recipient, uint256 deadline) MintParams";

    const thenaData = defaultAbiCoder.encode([mintParamsIface], [mintParams]);

    const tokens = [mintParams.token0, mintParams.token1];
    const amounts = ["50000000000000000000", "50000000000000000000"];

    await usdt.approve(batchTransaction.address, amount0);
    await usdc.approve(batchTransaction.address, amount1);

    const feeX = ["0"];
    const feeData = defaultAbiCoder.encode(
      ["uint256[]", "uint96[]", "address[]", "uint256[]", "bool"],
      [[1], feeX, tokens, amounts, true]
    );

    const tx = await batchTransaction.executeBatchCallsSameChain(
      0,
      tokens,
      amounts,
      feeData,
      [thenaMintPositionAdapter.address],
      [0],
      [2],
      [thenaData],
      { gasLimit: 10000000 }
    );
    const txReceipt = await tx.wait();
    const handlerBalancerAfter = await wnative.balanceOf(FEE_WALLET);
    const { data: PANCAKESWAPExecutionEventData } =
      decodeExecutionEvent(txReceipt);

    const PANCAKESWAPEventData = defaultAbiCoder.decode(
      [mintParamsIface, "uint256"],
      PANCAKESWAPExecutionEventData
    );

    const position = await positionManager.positions(PANCAKESWAPEventData[1]);
    expect(position.token0).eq(mintParams.token0);
    expect(position.token1).eq(mintParams.token1);
    // const position = await positionManager.positions(thenaEventData[1]);
    // expect(position.token0).eq(mintParams.token0);
    // expect(position.token1).eq(mintParams.token1);
  });
});
