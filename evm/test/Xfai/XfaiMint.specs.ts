import hardhat, { ethers, waffle } from "hardhat";
import { expect } from "chai";
import { defaultAbiCoder } from "ethers/lib/utils";
import { RPC } from "../constants";
import { DEXSPAN, DEFAULT_ENV } from "../../tasks/constants";
import { XfaiMint__factory } from "../../typechain/factories/XfaiMint__factory";
import { TokenInterface__factory } from "../../typechain/factories/TokenInterface__factory";
import { MockAssetForwarder__factory } from "../../typechain/factories/MockAssetForwarder__factory";
import { BatchTransaction__factory } from "../../typechain/factories/BatchTransaction__factory";
import { IWETH__factory } from "../../typechain/factories/IWETH__factory";
import { getTransaction } from "../utils";
import { XFAI_PERIPHERY } from "../../tasks/deploy/xfai/constants";

const CHAIN_ID = "59144";
const USDC = "0x176211869cA2b568f2A7D4EE941E073a821EE1ff";
const NATIVE_TOKEN = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const WNATIVE = "0xe5D7C2a44FfDDf6b295A15c148167daaAf5Cf34f";
const LP_TOKEN = "0xabBe925Cf6913A5af177Fb735dd817b02da0883f";

describe("XfaiMint Adapter: ", async () => {
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

    const XfaiMintPositionAdapter = await ethers.getContractFactory("XfaiMint");
    const xfaiMintPositionAdapter = await XfaiMintPositionAdapter.deploy(
      NATIVE_TOKEN,
      WNATIVE,
      XFAI_PERIPHERY[CHAIN_ID]
    );

    await batchTransaction.setAdapterWhitelist(
      [xfaiMintPositionAdapter.address],
      [true]
    );

    const MockToken = await ethers.getContractFactory("MockToken");
    const mockToken = await MockToken.deploy();
    await mockToken.mint(deployer.address, ethers.utils.parseEther("10000"));

    const xfaiLPToken = TokenInterface__factory.connect(
      LP_TOKEN,
      deployer
    );

    return {
      batchTransaction: BatchTransaction__factory.connect(
        batchTransaction.address,
        deployer
      ),
      xfaiMintPositionAdapter: XfaiMint__factory.connect(
        xfaiMintPositionAdapter.address,
        deployer
      ),
      mockToken: TokenInterface__factory.connect(mockToken.address, deployer),
      mockAssetForwarder: MockAssetForwarder__factory.connect(
        mockAssetForwarder.address,
        deployer
      ),
      usdc: TokenInterface__factory.connect(USDC, deployer),
      wnative: IWETH__factory.connect(WNATIVE, deployer),
      xfaiLPToken,
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

  it("Can mint a new position on Xfai Native/usdc", async () => {
    const {
      batchTransaction,
      xfaiMintPositionAdapter,
      usdc,
      wnative,
      xfaiLPToken,
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

    const user = deployer;
    const token = usdc.address;
    const amountETHDesired = ethers.utils.parseEther("0.05").toString();
    const amountTokenDesired = "182000000";
    const amountETHMin = ethers.utils.parseEther("0.025").toString();
    const amountTokenMin = "150000000";
    const deadline = 100000000000;

    const mintParams = {
      to: user.address,
      token,
      amountTokenDesired,
      amountETHDesired,
      amountTokenMin,
      amountETHMin,
      deadline,
    };

    const mintParamsIface =
      "tuple(address to, address token, uint amountTokenDesired, uint amountETHDesired, uint amountTokenMin, uint amountETHMin, uint deadline) XfaiSupplyData";

    const xfaiData = defaultAbiCoder.encode([mintParamsIface], [mintParams]);

    const tokens = [NATIVE_TOKEN, mintParams.token];
    const amounts = [
      mintParams.amountETHDesired,
      mintParams.amountTokenDesired,
    ];

    await usdc.approve(batchTransaction.address, mintParams.amountTokenDesired);

    const lpBalBefore = await xfaiLPToken.balanceOf(deployer.address);

    await batchTransaction.executeBatchCallsSameChain(
      0,
      tokens,
      amounts,
      [xfaiMintPositionAdapter.address],
      [0],
      [2],
      [xfaiData],
      {value: amountETHDesired}
    );

    const lpBalAfter = await xfaiLPToken.balanceOf(deployer.address);

    expect(lpBalAfter).gt(lpBalBefore);
  }); 
});
