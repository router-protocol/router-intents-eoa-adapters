import hardhat, { ethers, waffle } from "hardhat";
import { expect } from "chai";
import { defaultAbiCoder } from "ethers/lib/utils";
import { RPC } from "../constants";
import { DEXSPAN, DEFAULT_ENV } from "../../tasks/constants";
import { PancakeswapMint__factory } from "../../typechain/factories/PancakeswapMint__factory";
import { TokenInterface__factory } from "../../typechain/factories/TokenInterface__factory";
import { MockAssetForwarder__factory } from "../../typechain/factories/MockAssetForwarder__factory";
import { BatchTransaction__factory } from "../../typechain/factories/BatchTransaction__factory";
import { IWETH__factory } from "../../typechain/factories/IWETH__factory";
import { IPancakeswapNonfungiblePositionManager__factory } from "../../typechain/factories/IPancakeswapNonfungiblePositionManager__factory";
import { BigNumber, Contract, Wallet } from "ethers";
import { getPancakeswapData } from "./utils";
import { decodeExecutionEvent, getTransaction } from "../utils";

const CHAIN_ID = "56";
const PANCAKESWAP_V3_POSITION_MANAGER =
  "0x46A15B0b27311cedF172AB29E4f4766fbE7F4364";
const USDT = "0x55d398326f99059fF775485246999027B3197955";
const USDC = "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d";
const NATIVE_TOKEN = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const WNATIVE = "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c";
const THENA_SWAP_ROUTER = "0x327Dd3208f0bCF590A66110aCB6e5e6941A4EfA0";

const SWAP_ROUTER_ABI = [
  {
    "inputs": [
        {
            "components": [
                {
                    "internalType": "address",
                    "name": "tokenIn",
                    "type": "address"
                },
                {
                    "internalType": "address",
                    "name": "tokenOut",
                    "type": "address"
                },
                {
                    "internalType": "address",
                    "name": "recipient",
                    "type": "address"
                },
                {
                    "internalType": "uint256",
                    "name": "deadline",
                    "type": "uint256"
                },
                {
                    "internalType": "uint256",
                    "name": "amountIn",
                    "type": "uint256"
                },
                {
                    "internalType": "uint256",
                    "name": "amountOutMinimum",
                    "type": "uint256"
                },
                {
                    "internalType": "uint160",
                    "name": "limitSqrtPrice",
                    "type": "uint160"
                }
            ],
            "internalType": "struct ISwapRouter.ExactInputSingleParams",
            "name": "params",
            "type": "tuple"
        }
    ],
    "name": "exactInputSingleSupportingFeeOnTransferTokens",
    "outputs": [
        {
            "internalType": "uint256",
            "name": "amountOut",
            "type": "uint256"
        }
    ],
    "stateMutability": "payable",
    "type": "function"
}
];

describe("PancakeswapMint Adapter: ", async () => {
  const [deployer] = waffle.provider.getWallets();

  const setupTests = async () => {
    let env = process.env.ENV;
    if (!env) env = DEFAULT_ENV;

    const swapRouter = new ethers.Contract(
      THENA_SWAP_ROUTER,
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
      DEXSPAN[env][CHAIN_ID]
    );

    const PancakeswapMintPositionAdapter = await ethers.getContractFactory(
      "PancakeswapMint"
    );
    const pancakeswapMintPositionAdapter =
      await PancakeswapMintPositionAdapter.deploy(
        NATIVE_TOKEN,
        WNATIVE,
        PANCAKESWAP_V3_POSITION_MANAGER
      );

    await batchTransaction.setAdapterWhitelist(
      [pancakeswapMintPositionAdapter.address],
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
      pancakeswapMintPositionAdapter: PancakeswapMint__factory.connect(
        pancakeswapMintPositionAdapter.address,
        deployer
      ),
      mockToken: TokenInterface__factory.connect(mockToken.address, deployer),
      mockAssetForwarder: MockAssetForwarder__factory.connect(
        mockAssetForwarder.address,
        deployer
      ),
      usdt: TokenInterface__factory.connect(USDT, deployer),
      wnative: IWETH__factory.connect(WNATIVE, deployer),
      positionManager: IPancakeswapNonfungiblePositionManager__factory.connect(
        PANCAKESWAP_V3_POSITION_MANAGER,
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

  it("Can mint a new position on PANCAKESWAP", async () => {
    const {
      batchTransaction,
      pancakeswapMintPositionAdapter,
      positionManager,
      usdt,
      wnative,
      swapRouter
    } = await setupTests();

    await wnative.deposit({ value: ethers.utils.parseEther("10") });
    // await setUserTokenBalance(usdt, deployer, ethers.utils.parseEther("1000"));

    await wnative.approve(THENA_SWAP_ROUTER, ethers.utils.parseEther("5"));

    await swapRouter.exactInputSingleSupportingFeeOnTransferTokens(
      {
        tokenIn: wnative.address,
        tokenOut: usdt.address,
        recipient: deployer.address,
        deadline: ethers.constants.MaxUint256,
        amountIn: ethers.utils.parseEther("0.1"),
        amountOutMinimum: "0",
        limitSqrtPrice: "0"
      }
    );

    const usdtBal = await usdt.balanceOf(deployer.address);
    expect(usdtBal).gt(0);

    const user = deployer;
    const chainId = CHAIN_ID;
    const token1 = wnative.address;
    const token0 = usdt.address;
    const amount1 = ethers.utils.parseEther("0.1").toString();
    const amount0 = usdtBal.toString();
    const fee = 500;

    const mintParams = await getPancakeswapData({
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

    const PANCAKESWAPData = defaultAbiCoder.encode(
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
      [pancakeswapMintPositionAdapter.address],
      [0],
      [2],
      [PANCAKESWAPData]
    );
    const txReceipt = await tx.wait();

    const { data: PANCAKESWAPExecutionEventData } =
      decodeExecutionEvent(txReceipt);

    const PANCAKESWAPEventData = defaultAbiCoder.decode(
      [mintParamsIface, "uint256"],
      PANCAKESWAPExecutionEventData
    );

    const position = await positionManager.positions(PANCAKESWAPEventData[1]);
    expect(position.token0).eq(mintParams.token0);
    expect(position.token1).eq(mintParams.token1);
    expect(position.fee).eq(mintParams.fee);
  });
});
