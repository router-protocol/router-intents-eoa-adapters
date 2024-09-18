import hardhat, { ethers, waffle } from "hardhat";
import { expect } from "chai";
import { defaultAbiCoder } from "ethers/lib/utils";
import { RPC } from "../constants";
import { DEXSPAN, DEFAULT_ENV, FEE_WALLET } from "../../tasks/constants";
import { SymbioticAffine__factory } from "../../typechain/factories/SymbioticAffine__factory";
import { TokenInterface__factory } from "../../typechain/factories/TokenInterface__factory";
import { MockAssetForwarder__factory } from "../../typechain/factories/MockAssetForwarder__factory";
import { BatchTransaction__factory } from "../../typechain/factories/BatchTransaction__factory";
import { IWETH__factory } from "../../typechain/factories/IWETH__factory";
import { getTransaction } from "../utils";
import { zeroAddress } from "ethereumjs-util";

const CHAIN_ID = "59144";
const NATIVE_TOKEN = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const WNATIVE = "0xe5D7C2a44FfDDf6b295A15c148167daaAf5Cf34f";
const ULTRA_LRT = "0xB838Eb4F224c2454F2529213721500faf732bf4d";

describe("SymbioticAffine Adapter: ", async () => {
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

    const SymbioticAffineAdapter = await ethers.getContractFactory(
      "SymbioticAffine"
    );
    const symbioticAffineAdapter = await SymbioticAffineAdapter.deploy(
      NATIVE_TOKEN,
      WNATIVE,
      ULTRA_LRT
    );

    await batchTransaction.setAdapterWhitelist(
      [symbioticAffineAdapter.address, feeAdapter.address],
      [true, true]
    );

    const MockToken = await ethers.getContractFactory("MockToken");
    const mockToken = await MockToken.deploy();
    await mockToken.mint(deployer.address, ethers.utils.parseEther("10000"));

    const ultraLRTToken = TokenInterface__factory.connect(ULTRA_LRT, deployer);

    return {
      batchTransaction: BatchTransaction__factory.connect(
        batchTransaction.address,
        deployer
      ),
      symbioticAffineAdapter: SymbioticAffine__factory.connect(
        symbioticAffineAdapter.address,
        deployer
      ),
      mockToken: TokenInterface__factory.connect(mockToken.address, deployer),
      mockAssetForwarder: MockAssetForwarder__factory.connect(
        mockAssetForwarder.address,
        deployer
      ),
      wnative: IWETH__factory.connect(WNATIVE, deployer),
      ultraLRTToken,
    };
  };

  beforeEach(async function () {
    await hardhat.network.provider.request({
      method: "hardhat_reset",
      params: [
        {
          forking: {
            jsonRpcUrl: RPC[CHAIN_ID],
            blockNumber: 9589000
          },
        },
      ],
    });
  });

  it("Can stake base asset on Symbiotic Affine", async () => {
    const {
      batchTransaction,
      symbioticAffineAdapter,
      wnative,
      ultraLRTToken,
    } = await setupTests();

    await wnative.deposit({ value: ethers.utils.parseEther("0.1") });

    const unit256Max = ethers.BigNumber.from(
      "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"
    );

    const symbioticAffineData = defaultAbiCoder.encode(
      ["address", "address", "uint256"],
      [WNATIVE, deployer.address, unit256Max]
    );

    const tokens = [WNATIVE];
    const amounts = ["100000000000000000"];

    const appId = [0];
    const fee = ["0"];

    const feeData = defaultAbiCoder.encode(
      ["uint256[]", "uint96[]", "address[]", "uint256[]", "bool"],
      [appId, fee, tokens, amounts, true]
    );

    await wnative.approve(batchTransaction.address, "100000000000000000");

    const lrtBalBefore = await ultraLRTToken.balanceOf(deployer.address);

    const tx = await batchTransaction.executeBatchCallsSameChain(
      0,
      tokens,
      amounts,
      feeData,
      [symbioticAffineAdapter.address],
      [0],
      [2],
      [symbioticAffineData],
      {
        gasLimit: 10000000,
      }
    );

    const txReceipt = await tx.wait();

    const lrtBalAfter = await ultraLRTToken.balanceOf(deployer.address);

    expect(lrtBalAfter).gt(lrtBalBefore);
  });
});
