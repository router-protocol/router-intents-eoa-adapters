import hardhat, { ethers, waffle } from "hardhat";
import { expect } from "chai";
import { defaultAbiCoder } from "ethers/lib/utils";
import { RPC } from "../constants";
import { DEXSPAN, DEFAULT_ENV, FEE_WALLET } from "../../tasks/constants";
import { EigenLayerAffine__factory } from "../../typechain/factories/EigenLayerAffine__factory";
import { TokenInterface__factory } from "../../typechain/factories/TokenInterface__factory";
import { MockAssetForwarder__factory } from "../../typechain/factories/MockAssetForwarder__factory";
import { BatchTransaction__factory } from "../../typechain/factories/BatchTransaction__factory";
import { IWETH__factory } from "../../typechain/factories/IWETH__factory";
import { getTransaction } from "../utils";
import { zeroAddress } from "ethereumjs-util";
import { ULTRA_LRT } from "../../tasks/deploy/eigenLayer/constants";

const CHAIN_ID = "1";
const NATIVE_TOKEN = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const WNATIVE = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
const ST_ETH = "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84";

describe("EigenLayerAffine Adapter: ", async () => {
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

    const FeeAdapter = await ethers.getContractFactory("FeeAdapter");
    const feeAdapter = await FeeAdapter.deploy(
      NATIVE_TOKEN,
      WNATIVE,
      FEE_WALLET,
      5
    );

    const batchTransaction = await BatchTransaction.deploy(
      NATIVE_TOKEN,
      WNATIVE,
      mockAssetForwarder.address,
      DEXSPAN[env][CHAIN_ID],
      zeroAddress(),
      feeAdapter.address
    );

    const EigenLayerAffineAdapter = await ethers.getContractFactory(
      "EigenLayerAffine"
    );
    const eigenLayerAffineAdapter = await EigenLayerAffineAdapter.deploy(
      NATIVE_TOKEN,
      WNATIVE,
      ULTRA_LRT[CHAIN_ID]
    );

    await batchTransaction.setAdapterWhitelist(
      [eigenLayerAffineAdapter.address, feeAdapter.address],
      [true, true]
    );

    const MockToken = await ethers.getContractFactory("MockToken");
    const mockToken = await MockToken.deploy();
    await mockToken.mint(deployer.address, ethers.utils.parseEther("10000"));

    const ultraLRTToken = TokenInterface__factory.connect(ULTRA_LRT[CHAIN_ID], deployer);

    return {
      batchTransaction: BatchTransaction__factory.connect(
        batchTransaction.address,
        deployer
      ),
      eigenLayerAffineAdapter: EigenLayerAffine__factory.connect(
        eigenLayerAffineAdapter.address,
        deployer
      ),
      mockToken: TokenInterface__factory.connect(mockToken.address, deployer),
      mockAssetForwarder: MockAssetForwarder__factory.connect(
        mockAssetForwarder.address,
        deployer
      ),
      wnative: IWETH__factory.connect(WNATIVE, deployer),
      ultraLRTToken,
      stETH: TokenInterface__factory.connect(ST_ETH, deployer),
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

  it("Can stake base asset on EigenLayer Affine", async () => {
    const {
      batchTransaction,
      eigenLayerAffineAdapter,
      wnative,
      stETH,
      ultraLRTToken,
    } = await setupTests();

    await wnative.deposit({ value: ethers.utils.parseEther("0.1") });

    const txn = await getTransaction({
      fromTokenAddress: NATIVE_TOKEN,
      toTokenAddress: ST_ETH,
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
    expect(await stETH.balanceOf(deployer.address)).gt(0);

    const unit256Max = ethers.BigNumber.from(
      "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"
    );

    const EigenLayerAffineData = defaultAbiCoder.encode(
      ["address", "address", "uint256"],
      [WNATIVE, deployer.address, unit256Max]
    );

    const tokens = [WNATIVE];
    const amounts = [(await stETH.balanceOf(deployer.address)).toString()];

    const appId = [0];
    const fee = ["0"];

    const feeData = defaultAbiCoder.encode(
      ["uint256[]", "uint96[]", "address[]", "uint256[]", "bool"],
      [appId, fee, tokens, amounts, true]
    );

    await wnative.approve(batchTransaction.address, ethers.utils.parseEther("0.1"));

    const lrtBalBefore = await ultraLRTToken.balanceOf(deployer.address);

    await batchTransaction.executeBatchCallsSameChain(
      0,
      tokens,
      amounts,
      feeData,
      [eigenLayerAffineAdapter.address],
      [0],
      [2],
      [EigenLayerAffineData],
      {
        gasLimit: 10000000,
      }
    );

    const lrtBalAfter = await ultraLRTToken.balanceOf(deployer.address);

    expect(lrtBalAfter).gt(lrtBalBefore);
  });
});
