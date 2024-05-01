import hardhat, { ethers, waffle } from "hardhat";
import { expect } from "chai";
import { defaultAbiCoder } from "ethers/lib/utils";
import { RPC } from "../constants";
import { DEXSPAN, DEFAULT_ENV } from "../../tasks/constants";
import { LynexMint__factory } from "../../typechain/factories/LynexMint__factory";
import { TokenInterface__factory } from "../../typechain/factories/TokenInterface__factory";
import { MockAssetForwarder__factory } from "../../typechain/factories/MockAssetForwarder__factory";
import { BatchTransaction__factory } from "../../typechain/factories/BatchTransaction__factory";
import { IWETH__factory } from "../../typechain/factories/IWETH__factory";
import { getTransaction } from "../utils";
import { LYNEX_ROUTER } from "../../tasks/deploy/lynex/constants";

const CHAIN_ID = "59144";
const USDC = "0x176211869cA2b568f2A7D4EE941E073a821EE1ff";
const NATIVE_TOKEN = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const WNATIVE = "0xe5D7C2a44FfDDf6b295A15c148167daaAf5Cf34f";
const USDC_WETH_POOL = "0x6FB44889a9aA69F7290258D3716BfFcB33CdE184";

describe("LynexMint Adapter: ", async () => {
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
      DEXSPAN[env][CHAIN_ID]
    );

    const LynexMintPositionAdapter = await ethers.getContractFactory(
      "LynexMint"
    );
    const lynexMintPositionAdapter = await LynexMintPositionAdapter.deploy(
      NATIVE_TOKEN,
      WNATIVE,
      LYNEX_ROUTER[CHAIN_ID]
    );

    await batchTransaction.setAdapterWhitelist(
      [lynexMintPositionAdapter.address],
      [true]
    );

    const MockToken = await ethers.getContractFactory("MockToken");
    const mockToken = await MockToken.deploy();
    await mockToken.mint(deployer.address, ethers.utils.parseEther("10000"));

    const usdc_weth_pool = TokenInterface__factory.connect(
      USDC_WETH_POOL,
      deployer
    );

    return {
      batchTransaction: BatchTransaction__factory.connect(
        batchTransaction.address,
        deployer
      ),
      lynexMintPositionAdapter: LynexMint__factory.connect(
        lynexMintPositionAdapter.address,
        deployer
      ),
      mockToken: TokenInterface__factory.connect(mockToken.address, deployer),
      mockAssetForwarder: MockAssetForwarder__factory.connect(
        mockAssetForwarder.address,
        deployer
      ),
      usdc: TokenInterface__factory.connect(USDC, deployer),
      wnative: IWETH__factory.connect(WNATIVE, deployer),
      usdc_weth_pool,
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

  it("Can mint a new position on Lynex weth/usdc", async () => {
    const {
      batchTransaction,
      lynexMintPositionAdapter,
      usdc,
      wnative,
      usdc_weth_pool,
    } = await setupTests();

    await wnative.deposit({ value: ethers.utils.parseEther("0.1") });
    // await setUserTokenBalance(usdc, deployer, ethers.utils.parseEther("1"));

    const txn = await getTransaction({
      fromTokenAddress: NATIVE_TOKEN,
      toTokenAddress: USDC,
      amount: ethers.utils.parseEther("0.2").toString(),
      fromTokenChainId: CHAIN_ID,
      toTokenChainId: CHAIN_ID,
      senderAddress: deployer.address,
      receiverAddress: deployer.address,
    });

    await deployer.sendTransaction({
      to: txn.to,
      value: txn.value,
      data: txn.data,
    });
    expect(await usdc.balanceOf(deployer.address)).gt(0);

    const wethBal = await wnative.balanceOf(USDC_WETH_POOL);
    const wethBalNum = Number(wethBal.toString());
    const usdcBal = await usdc.balanceOf(USDC_WETH_POOL);
    const usdcBalNum = Number(usdcBal.toString());
    const wethDecimals = 10 ** 18;
    const usdcDecimals = 10 ** 6;

    const multipliier =
      (usdcBalNum * wethDecimals) / (usdcDecimals * wethBalNum);

    const user = deployer;
    const tokenA = wnative.address;
    const tokenB = usdc.address;
    const stable = false;
    const amountADesired = ethers.utils.parseEther("0.1").toString();
    const amountBDesired = parseInt((0.1 * multipliier * 10 ** 6).toString()); //(amountA) * multipliier * decimals;
    const amountAMin = ethers.utils.parseEther("0.05").toString();
    const amountBMin = (amountBDesired - 10000000).toString();
    const deadline = 100000000000;

    const mintParams = {
      tokenA,
      tokenB,
      stable,
      amountADesired,
      amountBDesired,
      amountAMin,
      amountBMin,
      to: user.address,
      deadline,
    };

    const mintParamsIface =
      "tuple(address tokenA, address tokenB, bool stable, uint256 amountADesired, uint256 amountBDesired, uint256 amountAMin, uint256 amountBMin, address to, uint256 deadline) LynexSupplyData";

    const lynexData = defaultAbiCoder.encode([mintParamsIface], [mintParams]);

    const tokens = [mintParams.tokenA, mintParams.tokenB];
    const amounts = [mintParams.amountADesired, mintParams.amountBDesired];

    if (mintParams.tokenA === wnative.address) {
      await wnative.approve(
        batchTransaction.address,
        mintParams.amountADesired
      );
      await usdc.approve(batchTransaction.address, mintParams.amountBDesired);
    } else {
      await usdc.approve(batchTransaction.address, mintParams.amountADesired);
      await wnative.approve(
        batchTransaction.address,
        mintParams.amountBDesired
      );
    }

    const lpBalBefore = await usdc_weth_pool.balanceOf(deployer.address);

    await batchTransaction.executeBatchCallsSameChain(
      0,
      tokens,
      amounts,
      [lynexMintPositionAdapter.address],
      [0],
      [2],
      [lynexData]
    );

    const lpBalAfter = await usdc_weth_pool.balanceOf(deployer.address);

    expect(lpBalAfter).gt(lpBalBefore);
  });

  it("Can mint a new position on Lynex usdc/weth", async () => {
    const {
      batchTransaction,
      lynexMintPositionAdapter,
      usdc,
      wnative,
      usdc_weth_pool,
    } = await setupTests();

    await wnative.deposit({ value: ethers.utils.parseEther("0.1") });
    // await setUserTokenBalance(usdc, deployer, ethers.utils.parseEther("1"));

    const txn = await getTransaction({
      fromTokenAddress: NATIVE_TOKEN,
      toTokenAddress: USDC,
      amount: ethers.utils.parseEther("0.2").toString(),
      fromTokenChainId: CHAIN_ID,
      toTokenChainId: CHAIN_ID,
      senderAddress: deployer.address,
      receiverAddress: deployer.address,
    });

    await deployer.sendTransaction({
      to: txn.to,
      value: txn.value,
      data: txn.data,
    });
    expect(await usdc.balanceOf(deployer.address)).gt(0);

    const wethBal = await wnative.balanceOf(USDC_WETH_POOL);
    const wethBalNum = Number(wethBal.toString());
    const usdcBal = await usdc.balanceOf(USDC_WETH_POOL);
    const usdcBalNum = Number(usdcBal.toString());
    const wethDecimals = 10 ** 18;
    const usdcDecimals = 10 ** 6;

    const multipliier =
      (usdcBalNum * wethDecimals) / (usdcDecimals * wethBalNum);

    const user = deployer;
    const tokenA = usdc.address;
    const tokenB = wnative.address;
    const stable = false;
    const amountADesired = parseInt((0.1 * multipliier * 10 ** 6).toString()); //(amountA) * multipliier * decimals;
    const amountBDesired = ethers.utils.parseEther("0.1").toString();
    const amountAMin = (amountADesired - 10000000).toString();
    const amountBMin = ethers.utils.parseEther("0.05").toString();
    const deadline = 10000000000;

    const mintParams = {
      tokenA,
      tokenB,
      stable,
      amountADesired,
      amountBDesired,
      amountAMin,
      amountBMin,
      to: user.address,
      deadline,
    };

    const mintParamsIface =
      "tuple(address tokenA, address tokenB, bool stable, uint256 amountADesired, uint256 amountBDesired, uint256 amountAMin, uint256 amountBMin, address to, uint256 deadline) LynexSupplyData";

    const lynexData = defaultAbiCoder.encode([mintParamsIface], [mintParams]);

    const tokens = [mintParams.tokenA, mintParams.tokenB];
    const amounts = [mintParams.amountADesired, mintParams.amountBDesired];

    if (mintParams.tokenA === wnative.address) {
      await wnative.approve(
        batchTransaction.address,
        mintParams.amountADesired
      );
      await usdc.approve(batchTransaction.address, mintParams.amountBDesired);
    } else {
      await usdc.approve(batchTransaction.address, mintParams.amountADesired);
      await wnative.approve(
        batchTransaction.address,
        mintParams.amountBDesired
      );
    }

    const lpBalBefore = await usdc_weth_pool.balanceOf(deployer.address);

    await batchTransaction.executeBatchCallsSameChain(
      0,
      tokens,
      amounts,
      [lynexMintPositionAdapter.address],
      [0],
      [2],
      [lynexData]
    );

    const lpBalAfter = await usdc_weth_pool.balanceOf(deployer.address);

    expect(lpBalAfter).gt(lpBalBefore);
  });
});
