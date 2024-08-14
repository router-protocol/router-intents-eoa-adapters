import hardhat, { ethers, waffle } from "hardhat";
import { expect } from "chai";
import { RPC } from "../constants";
import { DEXSPAN, DEFAULT_ENV, NATIVE, WNATIVE } from "../../tasks/constants";
import { ParifiVaultDeposit__factory } from "../../typechain/factories/ParifiVaultDeposit__factory";
import { TokenInterface__factory } from "../../typechain/factories/TokenInterface__factory";
import { MockAssetForwarder__factory } from "../../typechain/factories/MockAssetForwarder__factory";
import { BatchTransaction__factory } from "../../typechain/factories/BatchTransaction__factory";
import { BigNumber, Contract, Wallet } from "ethers";
import { defaultAbiCoder } from "ethers/lib/utils";
import { DexSpanAdapter__factory } from "../../typechain/factories/DexSpanAdapter__factory";
import { zeroAddress } from "ethereumjs-util";
import { USDC, PF_USDC, PF_WETH } from "../../tasks/deploy/parifi/constants";

const CHAIN_ID = "42161";

describe("ParifiVaultDeposit Adapter: ", async () => {
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
      NATIVE,
      WNATIVE[env][CHAIN_ID],
      mockAssetForwarder.address,
      DEXSPAN[env][CHAIN_ID],
      zeroAddress()
    );

    const DexSpanAdapter = await ethers.getContractFactory("DexSpanAdapter");
    const dexSpanAdapter = await DexSpanAdapter.deploy(
      NATIVE,
      WNATIVE[env][CHAIN_ID],
      DEXSPAN[env][CHAIN_ID]
    );

    const ParifiVaultDeposit = await ethers.getContractFactory(
      "ParifiVaultDeposit"
    );
    const parifiVaultDepositAdapter = await ParifiVaultDeposit.deploy(
      NATIVE,
      WNATIVE[env][CHAIN_ID],
      USDC[CHAIN_ID],
      PF_USDC[CHAIN_ID],
      PF_WETH[CHAIN_ID]
    );

    await batchTransaction.setAdapterWhitelist(
      [dexSpanAdapter.address, parifiVaultDepositAdapter.address],
      [true, true]
    );

    return {
      batchTransaction: BatchTransaction__factory.connect(
        batchTransaction.address,
        deployer
      ),
      parifiVaultDepositAdapter: ParifiVaultDeposit__factory.connect(
        parifiVaultDepositAdapter.address,
        deployer
      ),
      dexSpanAdapter: DexSpanAdapter__factory.connect(
        dexSpanAdapter.address,
        deployer
      ),
      mockAssetForwarder: MockAssetForwarder__factory.connect(
        mockAssetForwarder.address,
        deployer
      ),
      receiptTokenUsdc: TokenInterface__factory.connect(
        PF_USDC[CHAIN_ID],
        deployer
      ),
      receiptTokenWeth: TokenInterface__factory.connect(
        PF_WETH[CHAIN_ID],
        deployer
      ),
      usdc: TokenInterface__factory.connect(USDC[CHAIN_ID], deployer),
      weth: TokenInterface__factory.connect(WNATIVE[env][CHAIN_ID], deployer),
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

  it("Can deposit weth on parifi on same chain", async () => {
    const {
      batchTransaction,
      parifiVaultDepositAdapter,
      weth,
      receiptTokenWeth
    } = await setupTests();

    const amount = ethers.utils.parseEther("1");

    await weth.deposit({ value: ethers.utils.parseEther("1") });

    const parifiData = defaultAbiCoder.encode(
      ["address", "address", "uint256"],
      [weth.address, deployer.address, amount]
    );

    const tokens = [weth.address];
    const amounts = [amount];
    const targets = [parifiVaultDepositAdapter.address];
    const data = [parifiData];
    const value = [0];
    const callType = [2];
    const feeInfo = [{ fee: 0, recipient: zeroAddress() }];

    await weth.approve(batchTransaction.address, amount);

    const balBefore = await ethers.provider.getBalance(deployer.address);
    const receiptTokenBalBefore = await receiptTokenWeth.balanceOf(
      deployer.address
    );

    await batchTransaction.executeBatchCallsSameChain(
      0,
      tokens,
      amounts,
      feeInfo,
      targets,
      value,
      callType,
      data,
      { gasLimit: 10000000 }
    );

    const balAfter = await ethers.provider.getBalance(deployer.address);
    const receiptTokenBalAfter = await receiptTokenWeth.balanceOf(deployer.address);

    expect(balBefore).gt(balAfter);
    expect(receiptTokenBalAfter).gt(receiptTokenBalBefore);
  });
});
