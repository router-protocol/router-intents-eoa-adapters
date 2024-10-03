import hardhat, { ethers, waffle } from "hardhat";
import { expect } from "chai";
import { defaultAbiCoder } from "ethers/lib/utils";
import { RPC } from "../constants";
import { DEXSPAN, DEFAULT_ENV } from "../../tasks/constants";
import { WenSwapper__factory } from "../../typechain/factories/WenSwapper__factory";
import { TokenInterface__factory } from "../../typechain/factories/TokenInterface__factory";
import { IWenToken__factory } from "../../typechain/factories/IWenToken__factory";
import { MockAssetForwarder__factory } from "../../typechain/factories/MockAssetForwarder__factory";
import { BatchTransaction__factory } from "../../typechain/factories/BatchTransaction__factory";
import { IWETH__factory } from "../../typechain/factories/IWETH__factory";
import { IWenSwapper__factory } from "../../typechain/factories/IWenSwapper__factory";
import { BigNumber, Contract, Wallet } from "ethers";
import { decodeExecutionEvent } from "../utils";
import { zeroAddress } from "ethereumjs-util";
import { IWenSwapper } from "../../typechain/IWenSwapper";

const CHAIN_ID = "137";
const WEN_FOUNDRY = "0x3bB94837A91E22A134053B9F38728E27055ec3d1";
const NATIVE_TOKEN = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const WNATIVE = "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270";
const KID_JOKER = "0x2f89e67606290a9068A681A452f2AD8855087166";
const PURPLE = "0x2276E8B38A06e84442B4e6b33ECe6922706539cd"

const WEN_SWAPPER_ABI = [
    "function swapEthForTokens(address token, uint256 amountIn, uint256 amountOutMin, address to, uint256 deadline) external payable returns (uint256 amountOut)"
];

describe("WenSwapper Adapter: ", async () => {
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

    const wenFoundry = new ethers.Contract(
        WEN_FOUNDRY,
        WEN_SWAPPER_ABI,
        deployer
      );
    
    const batchTransaction = await BatchTransaction.deploy(
      NATIVE_TOKEN,
      WNATIVE,
      mockAssetForwarder.address,
      DEXSPAN[env][CHAIN_ID],
      zeroAddress()
    );

    const WenSwapperAdapter = await ethers.getContractFactory("WenSwapper");
    const wenSwapperAdapter = await WenSwapperAdapter.deploy(
      NATIVE_TOKEN,
      WNATIVE,
      WEN_FOUNDRY
    );    

    await batchTransaction.setAdapterWhitelist(
      [wenSwapperAdapter.address],
      [true]
    );    

    return {
      batchTransaction: BatchTransaction__factory.connect(
        batchTransaction.address,
        deployer
      ),
      wenSwapperAdapter: WenSwapper__factory.connect(
        wenSwapperAdapter.address,
        deployer
      ),
      wenFoundry,
      mockAssetForwarder: MockAssetForwarder__factory.connect(
        mockAssetForwarder.address,
        deployer
      ),
      kidJoker : IWenToken__factory.connect(KID_JOKER, deployer),
      purple: IWenToken__factory.connect(PURPLE, deployer),
      wnative: IWETH__factory.connect(WNATIVE, deployer),
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

  it("Can swap ETH for KID JOKER on pumpFun", async () => {
    const {
      batchTransaction,
      wenSwapperAdapter,
      kidJoker,
      wnative,
    } = await setupTests();
    const user = deployer;
    const chainId = CHAIN_ID;
    const amountIn = ethers.utils.parseEther("10");

    const swapParams = {
      tokenIn: NATIVE_TOKEN,
      tokenOut: kidJoker.address,
      amountIn: amountIn,
      amountOutMin: "0",
      to: deployer.address,
      deadline: ethers.constants.MaxUint256,
      txType: "1",
    };

    const swapParamsIface =
      "tuple(address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOutMin, address to, uint256 deadline, uint8 txType) WenSwapParams";

    const pumpFunData = defaultAbiCoder.encode([swapParamsIface], [swapParams]);

    const tokens = [swapParams.tokenIn];
    const amounts = [swapParams.amountIn];
    const feeInfo = [{ fee: 0, recipient: zeroAddress() }];

    const tx = await batchTransaction.executeBatchCallsSameChain(
      0,
      tokens,
      amounts,
      feeInfo,
      [wenSwapperAdapter.address],
      [0],
      [2],
      [pumpFunData],
      { value: amountIn,
        gasLimit: 10000000 }
    );

    const txReceipt = await tx.wait();

    const { data: pumpFunExecutionEventData } = decodeExecutionEvent(txReceipt);

    const kidJokerBal = await kidJoker.balanceOf(deployer.address);
    expect(kidJokerBal).gt(0);

    const pumpFunEventData = defaultAbiCoder.decode(
      [swapParamsIface, "uint256"],
      pumpFunExecutionEventData
    );

    expect(kidJokerBal).eq(pumpFunEventData[1]);
  });

//   it.only("Can swap WEN TOKEN for ETH on pumpFun", async () => {
//     const {
//       batchTransaction,
//       wenSwapperAdapter,
//       kidJoker,
//       wnative,
//       wenFoundry,
//       purple
//     } = await setupTests();
//     await wenFoundry.swapEthForTokens(purple.address, ethers.utils.parseEther("2"), "0", deployer.address, ethers.constants.MaxUint256, {value: ethers.utils.parseEther("2")});
//     const user = deployer;
//     const chainId = CHAIN_ID;
//     const amountIn = (await purple.balanceOf(deployer.address)).div(2).toString();

//     const swapParams = {
//       tokenIn: purple.address,
//       tokenOut: NATIVE_TOKEN,
//       amountIn: amountIn,
//       amountOutMin: "0",
//       to: deployer.address,
//       deadline: ethers.constants.MaxUint256,
//       txType: "2",
//     };

//     const swapParamsIface =
//       "tuple(address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOutMin, address to, uint256 deadline, uint8 txType) WenSwapParams";

//     const pumpFunData = defaultAbiCoder.encode([swapParamsIface], [swapParams]);

//     const tokens = [swapParams.tokenIn];
//     const amounts = [swapParams.amountIn];
//     const feeInfo = [{ fee: 0, recipient: zeroAddress() }];

//     const ethBalBefore = await ethers.provider.getBalance(deployer.address);

//     await purple.approve(batchTransaction.address, amountIn);

//     const tx = await batchTransaction.executeBatchCallsSameChain(
//       0,
//       tokens,
//       amounts,
//       feeInfo,
//       [wenSwapperAdapter.address],
//       [0],
//       [2],
//       [pumpFunData],
//       { gasLimit: 10000000 }
//     );

//     const txReceipt = await tx.wait();

//     const { data: pumpFunExecutionEventData } = decodeExecutionEvent(txReceipt);

//     const ethBalAfter = await ethers.provider.getBalance(deployer.address);
//     expect(ethBalAfter).gt(ethBalBefore);

//     const pumpFunEventData = defaultAbiCoder.decode(
//       [swapParamsIface, "uint256"],
//       pumpFunExecutionEventData
//     );

//     expect(ethBalAfter.sub(ethBalBefore)).eq(pumpFunEventData[1]);
//   });
});
