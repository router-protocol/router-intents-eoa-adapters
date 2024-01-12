import hardhat, { ethers, waffle } from "hardhat";
import { expect } from "chai";
import { RPC } from "../constants";
import { DEXSPAN, DEFAULT_ENV } from "../../tasks/constants";
import { TokenInterface__factory } from "../../typechain/factories/TokenInterface__factory";
import { MockAssetForwarder__factory } from "../../typechain/factories/MockAssetForwarder__factory";
import { BatchTransaction__factory } from "../../typechain/factories/BatchTransaction__factory";
import { CompoundBorrow__factory } from "../../typechain/factories/CompoundBorrow__factory";
import { defaultAbiCoder } from "ethers/lib/utils";
import { CompoundSupply__factory } from "../../typechain/factories/CompoundSupply__factory";
import { IComet__factory } from "../../typechain/factories/IComet__factory";

const CHAIN_ID = "5";
const COMPOUND_USDC_POOL = "0x3EE77595A8459e93C2888b13aDB354017B198188";
const COMPOUND_WETH_POOL = "0x9A539EEc489AAA03D588212a164d0abdB5F08F5F";
const NATIVE_TOKEN = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const WETH = "0x42a71137C09AE83D8d05974960fd607d40033499";
const C_WETH_ADDRESS = "0x9A539EEc489AAA03D588212a164d0abdB5F08F5F";
const C_USDC_ADDRESS = "0x3EE77595A8459e93C2888b13aDB354017B198188";
const USDC = "0x07865c6E87B9F70255377e024ace6630C1Eaa37F";

describe("CompoundBorrow Adapter: ", async () => {
  const [deployer] = waffle.provider.getWallets();

  const setupTests = async () => {
    let env = process.env.ENV;
    if (!env) env = DEFAULT_ENV;
    const MockAssetForwarder = await ethers.getContractFactory(
      "MockAssetForwarder"
    );
    const mockAssetForwarder = await MockAssetForwarder.deploy();

    const CompoundSupplyAdapter = await ethers.getContractFactory(
      "CompoundSupply"
    );

    const compoundSupplyAdapter = await CompoundSupplyAdapter.deploy(
      NATIVE_TOKEN,
      WETH,
      USDC,
      COMPOUND_USDC_POOL,
      COMPOUND_WETH_POOL
    );

    const CompoundBorrowAdapter = await ethers.getContractFactory(
      "CompoundBorrow"
    );

    const compoundBorrowAdapter = await CompoundBorrowAdapter.deploy(
      NATIVE_TOKEN,
      WETH,
      USDC,
      COMPOUND_USDC_POOL,
      COMPOUND_WETH_POOL
    );

    const BatchTransaction = await ethers.getContractFactory(
      "BatchTransaction"
    );

    const batchTransaction = await BatchTransaction.deploy(
      NATIVE_TOKEN,
      WETH,
      mockAssetForwarder.address,
      DEXSPAN[env][CHAIN_ID]
    );

    await batchTransaction.setAdapterWhitelist(
      [compoundBorrowAdapter.address, compoundSupplyAdapter.address],
      [true, true]
    );

    const weth = TokenInterface__factory.connect(WETH, deployer);
    const cWeth = TokenInterface__factory.connect(C_WETH_ADDRESS, deployer);
    const cUSDC = TokenInterface__factory.connect(C_USDC_ADDRESS, deployer);
    const usdc = TokenInterface__factory.connect(USDC, deployer);
    const compoundUSDCPool = IComet__factory.connect(
      COMPOUND_USDC_POOL,
      deployer
    );
    const compoundWETHPool = IComet__factory.connect(
      COMPOUND_WETH_POOL,
      deployer
    );

    const MockToken = await ethers.getContractFactory("MockToken");
    const mockToken = await MockToken.deploy();
    await mockToken.mint(deployer.address, ethers.utils.parseEther("10000"));

    return {
      compoundSupplyAdapter: CompoundSupply__factory.connect(
        compoundSupplyAdapter.address,
        deployer
      ),
      compoundBorrowAdapter: CompoundBorrow__factory.connect(
        compoundBorrowAdapter.address,
        deployer
      ),
      batchTransaction: BatchTransaction__factory.connect(
        batchTransaction.address,
        deployer
      ),
      weth,
      cWeth,
      usdc,
      cUSDC,
      compoundUSDCPool,
      compoundWETHPool,
      mockAssetForwarder: MockAssetForwarder__factory.connect(
        mockAssetForwarder.address,
        deployer
      ),
      mockToken: TokenInterface__factory.connect(mockToken.address, deployer),
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

  it("Can borrow funds on user's behalf on weth market", async () => {
    const {
      weth,
      cWeth,
      batchTransaction,
      compoundBorrowAdapter,
      compoundSupplyAdapter,
      compoundWETHPool,
    } = await setupTests();

    const supplyAsset = NATIVE_TOKEN;
    const supplyAmount = ethers.utils.parseEther("10");
    const supplyOnBehalfOf = deployer.address;

    const compoundSupplyData = defaultAbiCoder.encode(
      ["address", "address", "uint256", "address"],
      [supplyAsset, supplyOnBehalfOf, supplyAmount, WETH]
    );

    const borrowAmount = "10000";
    const borrowAsset = WETH;
    const borrowOnBehalfOf = deployer.address;
    const borrowRecipient = deployer.address;

    const compoundBorrowData = defaultAbiCoder.encode(
      ["uint256", "address", "address", "address"],
      [borrowAmount, borrowAsset, borrowOnBehalfOf, borrowRecipient]
    );

    const tokens = [supplyAsset];
    const amounts = [supplyAmount];
    const targets = [
      compoundSupplyAdapter.address,
      compoundBorrowAdapter.address,
    ];
    const data = [compoundSupplyData, compoundBorrowData];
    const value = [0, 0];
    const callType = [2, 2];

    await compoundWETHPool.allow(batchTransaction.address, true);

    const userBalBefore = await cWeth.balanceOf(deployer.address);
    const wethBalBefore = await weth.balanceOf(deployer.address);
    await batchTransaction.executeBatchCallsSameChain(
      tokens,
      amounts,
      targets,
      value,
      callType,
      data,
      { value: supplyAmount }
    );

    const userBalAfter = await cWeth.balanceOf(deployer.address);
    const wethBalAfter = await weth.balanceOf(deployer.address);

    expect(userBalBefore).eq(0);
    expect(userBalAfter).gt(0);
    expect(wethBalBefore).eq(0);
    expect(wethBalAfter).eq(borrowAmount);
  });

  it("Can borrow funds on user's behalf on usdc market", async () => {
    const {
      usdc,
      batchTransaction,
      compoundBorrowAdapter,
      compoundSupplyAdapter,
      compoundUSDCPool,
    } = await setupTests();

    const supplyAsset = NATIVE_TOKEN;
    const supplyAmount = ethers.utils.parseEther("10");
    const supplyOnBehalfOf = deployer.address;

    const compoundSupplyData = defaultAbiCoder.encode(
      ["address", "address", "uint256", "address"],
      [supplyAsset, supplyOnBehalfOf, supplyAmount, USDC]
    );

    const borrowAmount = "10000";
    const borrowAsset = USDC;
    const borrowOnBehalfOf = deployer.address;
    const borrowRecipient = deployer.address;

    const compoundBorrowData = defaultAbiCoder.encode(
      ["uint256", "address", "address", "address"],
      [borrowAmount, borrowAsset, borrowOnBehalfOf, borrowRecipient]
    );

    const tokens = [supplyAsset];
    const amounts = [supplyAmount];
    const targets = [
      compoundSupplyAdapter.address,
      compoundBorrowAdapter.address,
    ];
    const data = [compoundSupplyData, compoundBorrowData];
    const value = [0, 0];
    const callType = [2, 2];

    await compoundUSDCPool.allow(batchTransaction.address, true);

    const usdcBalBefore = await usdc.balanceOf(deployer.address);
    await batchTransaction.executeBatchCallsSameChain(
      tokens,
      amounts,
      targets,
      value,
      callType,
      data,
      { value: supplyAmount }
    );

    const usdcBalAfter = await usdc.balanceOf(deployer.address);

    const collateralBal = await compoundUSDCPool.collateralBalanceOf(
      deployer.address,
      WETH
    );

    expect(collateralBal).gt(0);

    expect(usdcBalAfter).eq(usdcBalBefore.add(borrowAmount));
  });
});
