import hardhat, { ethers, waffle } from "hardhat";
import { expect } from "chai";
import { defaultAbiCoder } from "ethers/lib/utils";
import { RPC } from "../constants";
import { DEXSPAN, DEFAULT_ENV } from "../../tasks/constants";
import { LynexGamma__factory } from "../../typechain/factories/LynexGamma__factory";
import { TokenInterface__factory } from "../../typechain/factories/TokenInterface__factory";
import { IHypervisor__factory } from "../../typechain/factories/IHypervisor__factory";
import { MockAssetForwarder__factory } from "../../typechain/factories/MockAssetForwarder__factory";
import { BatchTransaction__factory } from "../../typechain/factories/BatchTransaction__factory";
import { IWETH__factory } from "../../typechain/factories/IWETH__factory";
import { decodeExecutionEvent, getTransaction } from "../utils";
import { LYNEX_GAMMA } from "../../tasks/deploy/lynex/constants";

const CHAIN_ID = "59144";
const USDC = "0x176211869cA2b568f2A7D4EE941E073a821EE1ff";
const NATIVE_TOKEN = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const WNATIVE = "0xe5D7C2a44FfDDf6b295A15c148167daaAf5Cf34f";
const A_USDC_WETH = "0x0B15A5E3cA0D4b492C3b476d0f807535F9B72079";
const A_WEETH_WETH = "0x530071b0373Ab3029cAd32E0c19b75253e231b69";

describe("LynexGamma Adapter: ", async () => {
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

    const LynexGammaAdapter = await ethers.getContractFactory("LynexGamma");
    const lynexGammaAdapter = await LynexGammaAdapter.deploy(
      NATIVE_TOKEN,
      WNATIVE,
      LYNEX_GAMMA[CHAIN_ID]
    );

    await batchTransaction.setAdapterWhitelist(
      [lynexGammaAdapter.address],
      [true]
    );

    const MockToken = await ethers.getContractFactory("MockToken");
    const mockToken = await MockToken.deploy();
    await mockToken.mint(deployer.address, ethers.utils.parseEther("10000"));

    const a_usdc_weth = IHypervisor__factory.connect(A_USDC_WETH, deployer);

    const a_weeth_weth = IHypervisor__factory.connect(A_WEETH_WETH, deployer);

    return {
      batchTransaction: BatchTransaction__factory.connect(
        batchTransaction.address,
        deployer
      ),
      lynexGammaAdapter: LynexGamma__factory.connect(
        lynexGammaAdapter.address,
        deployer
      ),
      mockToken: TokenInterface__factory.connect(mockToken.address, deployer),
      mockAssetForwarder: MockAssetForwarder__factory.connect(
        mockAssetForwarder.address,
        deployer
      ),
      usdc: TokenInterface__factory.connect(USDC, deployer),
      wnative: IWETH__factory.connect(WNATIVE, deployer),
      a_usdc_weth,
      a_weeth_weth,
    };
  };

  beforeEach(async function () {
    await hardhat.network.provider.request({
      method: "hardhat_reset",
      params: [
        {
          forking: {
            jsonRpcUrl: RPC[CHAIN_ID],
            blockNumber: 5578967,
          },
        },
      ],
    });
  });

  it("Can mint a new position on Lynex weth/usdc and receiver gets aUSDC/WETH", async () => {
    const {
      batchTransaction,
      lynexGammaAdapter,
      usdc,
      wnative,
      a_usdc_weth,
      a_weeth_weth,
    } = await setupTests();

    await wnative.deposit({ value: ethers.utils.parseEther("0.1") });
    // await setUserTokenBalance(usdc, deployer, ethers.utils.parseEther("1"));

    const txn = await getTransaction({
      fromTokenAddress: NATIVE_TOKEN,
      toTokenAddress: USDC,
      amount: ethers.utils.parseEther("0.1").toString(),
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
    const usdcBal = await usdc.balanceOf(deployer.address);
    expect(usdcBal).gt(0);

    const user = deployer;
    const token0 = await a_usdc_weth.token0();
    const token1 = await a_usdc_weth.token1();
    const deposit0 = "1800000";
    const deposit1 = "320210142310047";

    const mintParams = {
      tokenA: token0,
      tokenB: token1,
      depositA: deposit0,
      depositB: deposit1,
      to: user.address,
      pos: A_USDC_WETH,
      minIn: [0, 0, 0, 0],
    };

    const mintParamsIface =
      "tuple(address tokenA, address tokenB, uint256 depositA, uint256 depositB, address to, address pos, uint256[4] minIn) LynexDepositData";

    const lynexData = defaultAbiCoder.encode([mintParamsIface], [mintParams]);

    const tokens = [mintParams.tokenA, mintParams.tokenB];
    const amounts = [mintParams.depositA, mintParams.depositB];

    if (mintParams.tokenA === wnative.address) {
      await wnative.approve(batchTransaction.address, mintParams.depositA);
      await usdc.approve(batchTransaction.address, mintParams.depositB);
    } else {
      await usdc.approve(batchTransaction.address, mintParams.depositA);
      await wnative.approve(batchTransaction.address, mintParams.depositB);
    }

    const lpBalBefore = await a_usdc_weth.balanceOf(deployer.address);

    const tx = await batchTransaction.executeBatchCallsSameChain(
      0,
      tokens,
      amounts,
      [lynexGammaAdapter.address],
      [0],
      [2],
      [lynexData],
      { gasLimit: 10000000 }
    );

    const txReceipt = await tx.wait();

    const { data: LynexGammaExecutionEventData } =
      decodeExecutionEvent(txReceipt);

    const LynexGammaEventData = defaultAbiCoder.decode(
      [mintParamsIface, "uint256"],
      LynexGammaExecutionEventData
    );

    const lpBalAfter = await a_usdc_weth.balanceOf(deployer.address);
    const lpBalEvent = LynexGammaEventData[1];
    expect(lpBalAfter).eq(lpBalEvent);

    expect(lpBalAfter).gt(lpBalBefore);
  });

  it("Can mint a new position on Lynex weth/usdc and receiver gets aUSDC/WETH", async () => {
    const {
      batchTransaction,
      lynexGammaAdapter,
      usdc,
      wnative,
      a_usdc_weth,
      a_weeth_weth,
    } = await setupTests();

    await wnative.deposit({ value: ethers.utils.parseEther("0.1") });
    // await setUserTokenBalance(usdc, deployer, ethers.utils.parseEther("1"));

    const txn = await getTransaction({
      fromTokenAddress: NATIVE_TOKEN,
      toTokenAddress: USDC,
      amount: ethers.utils.parseEther("0.1").toString(),
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
    const usdcBal = await usdc.balanceOf(deployer.address);
    expect(usdcBal).gt(0);

    const user = deployer;
    const token0 = await a_usdc_weth.token0();
    const token1 = await a_usdc_weth.token1();
    const deposit0 = "1800000";
    const deposit1 = "320210142310047";

    const mintParams = {
      tokenA: token1,
      tokenB: token0,
      depositA: deposit1,
      depositB: deposit0,
      to: user.address,
      pos: A_USDC_WETH,
      minIn: [0, 0, 0, 0],
    };

    const mintParamsIface =
      "tuple(address tokenA, address tokenB, uint256 depositA, uint256 depositB, address to, address pos, uint256[4] minIn) LynexDepositData";

    const lynexData = defaultAbiCoder.encode([mintParamsIface], [mintParams]);

    const tokens = [mintParams.tokenA, mintParams.tokenB];
    const amounts = [mintParams.depositA, mintParams.depositB];

    if (mintParams.tokenA === wnative.address) {
      await wnative.approve(batchTransaction.address, mintParams.depositA);
      await usdc.approve(batchTransaction.address, mintParams.depositB);
    } else {
      await usdc.approve(batchTransaction.address, mintParams.depositA);
      await wnative.approve(batchTransaction.address, mintParams.depositB);
    }

    const lpBalBefore = await a_usdc_weth.balanceOf(deployer.address);

    const tx = await batchTransaction.executeBatchCallsSameChain(
      0,
      tokens,
      amounts,
      [lynexGammaAdapter.address],
      [0],
      [2],
      [lynexData],
      { gasLimit: 10000000 }
    );

    const txReceipt = await tx.wait();

    const { data: LynexGammaExecutionEventData } =
      decodeExecutionEvent(txReceipt);

    const LynexGammaEventData = defaultAbiCoder.decode(
      [mintParamsIface, "uint256"],
      LynexGammaExecutionEventData
    );

    const lpBalAfter = await a_usdc_weth.balanceOf(deployer.address);
    const lpBalEvent = LynexGammaEventData[1];
    expect(lpBalAfter).eq(lpBalEvent);

    expect(lpBalAfter).gt(lpBalBefore);
  });

  it("Can mint a new position on Lynex weth/usdc and receiver gets aUSDC/WETH if one of the tokens is native", async () => {
    const {
      batchTransaction,
      lynexGammaAdapter,
      usdc,
      wnative,
      a_usdc_weth,
      a_weeth_weth,
    } = await setupTests();

    await wnative.deposit({ value: ethers.utils.parseEther("0.1") });
    // await setUserTokenBalance(usdc, deployer, ethers.utils.parseEther("1"));

    const txn = await getTransaction({
      fromTokenAddress: NATIVE_TOKEN,
      toTokenAddress: USDC,
      amount: ethers.utils.parseEther("0.1").toString(),
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
    const usdcBal = await usdc.balanceOf(deployer.address);
    expect(usdcBal).gt(0);

    const user = deployer;
    const deposit0 = "1800000";
    const deposit1 = "320210142310047";

    const mintParams = {
      tokenA: NATIVE_TOKEN,
      tokenB: USDC,
      depositA: deposit1,
      depositB: deposit0,
      to: user.address,
      pos: A_USDC_WETH,
      minIn: [0, 0, 0, 0],
    };

    const mintParamsIface =
      "tuple(address tokenA, address tokenB, uint256 depositA, uint256 depositB, address to, address pos, uint256[4] minIn) LynexDepositData";

    const lynexData = defaultAbiCoder.encode([mintParamsIface], [mintParams]);

    const tokens = [mintParams.tokenA, mintParams.tokenB];
    const amounts = [mintParams.depositA, mintParams.depositB];

    await usdc.approve(batchTransaction.address, mintParams.depositB);

    const lpBalBefore = await a_usdc_weth.balanceOf(deployer.address);

    const tx = await batchTransaction.executeBatchCallsSameChain(
      0,
      tokens,
      amounts,
      [lynexGammaAdapter.address],
      [0],
      [2],
      [lynexData],
      { gasLimit: 10000000, value: mintParams.depositA }
    );

    const txReceipt = await tx.wait();

    const { data: LynexGammaExecutionEventData } =
      decodeExecutionEvent(txReceipt);

    const LynexGammaEventData = defaultAbiCoder.decode(
      [mintParamsIface, "uint256"],
      LynexGammaExecutionEventData
    );

    const lpBalAfter = await a_usdc_weth.balanceOf(deployer.address);
    const lpBalEvent = LynexGammaEventData[1];
    expect(lpBalAfter).eq(lpBalEvent);

    expect(lpBalAfter).gt(lpBalBefore);
  });
});
