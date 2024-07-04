import hardhat, { ethers, waffle } from "hardhat";
import { expect } from "chai";
import { defaultAbiCoder } from "ethers/lib/utils";
import { RPC } from "../constants";
import { DEXSPAN, DEFAULT_ENV } from "../../tasks/constants";
import { KimV2Mint__factory } from "../../typechain/factories/KimV2Mint__factory";
import { TokenInterface__factory } from "../../typechain/factories/TokenInterface__factory";
import { MockAssetForwarder__factory } from "../../typechain/factories/MockAssetForwarder__factory";
import { BatchTransaction__factory } from "../../typechain/factories/BatchTransaction__factory";
import { IWETH__factory } from "../../typechain/factories/IWETH__factory";
import { IKimRouter__factory } from "../../typechain/factories/IKimRouter__factory";
import { BigNumber, Contract, Wallet } from "ethers";
import { decodeExecutionEvent } from "../utils";
import { zeroAddress } from "ethereumjs-util";

const CHAIN_ID = "34443";
const USDC = "0xd988097fb8612cc24eeC14542bC03424c656005f";
const USDT = "0xf0F161fDA2712DB8b566946122a5af183995e2eD";
const NATIVE_TOKEN = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const WNATIVE = "0x4200000000000000000000000000000000000006";
const SWAP_ROUTER = "0x5D61c537393cf21893BE619E36fC94cd73C77DD3";

describe("KimV2Mint Adapter: ", async () => {
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

    const batchTransaction = await BatchTransaction.deploy(
      NATIVE_TOKEN,
      WNATIVE,
      mockAssetForwarder.address,
      DEXSPAN[env][CHAIN_ID],
      zeroAddress()
    );

    const KimV2MintPositionAdapter = await ethers.getContractFactory(
      "KimV2Mint"
    );
    const kimV2MintPositionAdapter = await KimV2MintPositionAdapter.deploy(
      NATIVE_TOKEN,
      WNATIVE,
      SWAP_ROUTER
    );

    await batchTransaction.setAdapterWhitelist(
      [kimV2MintPositionAdapter.address],
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
      kimV2MintPositionAdapter: KimV2Mint__factory.connect(
        kimV2MintPositionAdapter.address,
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
      swapRouter: IKimRouter__factory.connect(SWAP_ROUTER, deployer),
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

  it("Can mint a new position on Kim V2", async () => {
    const {
      batchTransaction,
      kimV2MintPositionAdapter,
      swapRouter,
      usdc,
      usdt,
      wnative,
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
    const tokenA = usdc.address;
    const tokenB = usdt.address;
    const amountA = usdcBal.toString();
    const amountB = usdtBal.toString();

    const mintParams = {
      tokenA: tokenA,
      tokenB: tokenB,
      to: user.address,
      amountADesired: amountA,
      amountBDesired: amountB,
      amountAMin: "0",
      amountBMin: "0",
      deadline: ethers.constants.MaxUint256,
    };

    const mintParamsIface =
      "tuple(address tokenA, address tokenB, address to, uint256 amountADesired, uint256 amountBDesired, uint256 amountAMin, uint256 amountBMin, uint256 deadline) KimSupplyData";

    const kimV2Data = defaultAbiCoder.encode([mintParamsIface], [mintParams]);

    const tokens = [mintParams.tokenA, mintParams.tokenB];
    const amounts = [mintParams.amountADesired, mintParams.amountBDesired];

    if (mintParams.tokenA === usdt.address) {
      await usdt.approve(batchTransaction.address, mintParams.amountADesired);
      await usdc.approve(batchTransaction.address, mintParams.amountBDesired);
    } else {
      await usdc.approve(batchTransaction.address, mintParams.amountADesired);
      await usdt.approve(batchTransaction.address, mintParams.amountBDesired);
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
      [kimV2MintPositionAdapter.address],
      [0],
      [2],
      [kimV2Data],
      { gasLimit: 10000000 }
    );
    const txReceipt = await tx.wait();

    const { data: kimV2ExecutionEventData } = decodeExecutionEvent(txReceipt);

    const kimV2EventData = defaultAbiCoder.decode(
      [mintParamsIface, "uint256", "uint256", "uint256"],
      kimV2ExecutionEventData
    );

    console.log("AMOUNT A ADDED: ", kimV2EventData[1].toString());
    console.log("AMOUNT B ADDED: ", kimV2EventData[2].toString());
    console.log("LIQUIDITY: ", kimV2EventData[3].toString());
  });
});
