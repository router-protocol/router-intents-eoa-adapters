import hardhat, { ethers, waffle } from "hardhat";
import { expect } from "chai";
import { RPC } from "../constants";
import { DEFAULT_ENV, NATIVE } from "../../tasks/constants";
import { ParifiFairsale__factory } from "../../typechain/factories/ParifiFairsale__factory";
import { MockAssetForwarder__factory } from "../../typechain/factories/MockAssetForwarder__factory";
import { BatchTransaction__factory } from "../../typechain/factories/BatchTransaction__factory";
import { defaultAbiCoder } from "ethers/lib/utils";

const CHAIN_ID = "421614";
const USDC = "0x3EF9d22C43ccE024405bc4a96580b9aE86e85121";
const WETH = "0xc50a09e4ec9e61e1c143eb24ee63fb4a1956e790";

describe("Parifi Fairsale Adapter: ", async () => {
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
      WETH,
      mockAssetForwarder.address,
      //   DEXSPAN[env][CHAIN_ID]
      mockAssetForwarder.address
    );

    const TestParifiFairsale = await ethers.getContractFactory(
      "TestParifiFairsale"
    );
    const parifiFairsaleContract = await TestParifiFairsale.deploy(
      USDC,
      USDC,
      "1710432000",
      "1710532000",
      "150000000000000"
    );

    const ParifiFairsale = await ethers.getContractFactory("ParifiFairsale");
    const parifiFairsaleAdapter = await ParifiFairsale.deploy(
      NATIVE,
      WETH,
      parifiFairsaleContract.address
    );

    const stableTokenInContract = await parifiFairsaleAdapter.stable();
    expect(stableTokenInContract).eq(USDC);

    await batchTransaction.setAdapterWhitelist(
      [parifiFairsaleAdapter.address],
      [true]
    );

    return {
      batchTransaction: BatchTransaction__factory.connect(
        batchTransaction.address,
        deployer
      ),
      parifiFairsaleAdapter: ParifiFairsale__factory.connect(
        parifiFairsaleAdapter.address,
        deployer
      ),
      mockAssetForwarder: MockAssetForwarder__factory.connect(
        mockAssetForwarder.address,
        deployer
      ),
      parifiFairsaleContract,
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

  it("Can participate in fairsale on Parifi", async () => {
    const { batchTransaction, parifiFairsaleContract, parifiFairsaleAdapter } =
      await setupTests();

    const amount = "100000000";

    const usdc = new ethers.Contract(
      USDC,
      [
        "function mint(uint256 amount) external",
        "function balanceOf(address user) external view returns (uint256)",
        "function approve(address spender, uint256 amount) external",
      ],
      deployer
    );

    await usdc.mint(amount);
    expect(await usdc.balanceOf(deployer.address)).eq(amount);

    const parifiData = defaultAbiCoder.encode(
      ["address", "uint256"],
      [deployer.address, amount]
    );

    await usdc.approve(batchTransaction.address, amount);

    const tokens = [USDC];
    const amounts = [amount];
    const targets = [parifiFairsaleAdapter.address];
    const data = [parifiData];
    const value = [0];
    const callType = [2];

    const userContributionBefore = await parifiFairsaleContract.contributions(
      deployer.address
    );

    await batchTransaction.executeBatchCallsSameChain(
      0,
      tokens,
      amounts,
      targets,
      value,
      callType,
      data
    );

    const userContributionAfter = await parifiFairsaleContract.contributions(
      deployer.address
    );

    expect(userContributionBefore).eq(0);
    expect(userContributionAfter).eq(amount);
  });

  it("Can participate in fairsale on Parifi on dest chain", async () => {
    const {
      batchTransaction,
      parifiFairsaleAdapter,
      parifiFairsaleContract,
      mockAssetForwarder,
    } = await setupTests();

    const amount = "100000000";

    const usdc = new ethers.Contract(
      USDC,
      [
        "function mint(uint256 amount) external",
        "function balanceOf(address user) external view returns (uint256)",
        "function approve(address spender, uint256 amount) external",
      ],
      deployer
    );

    await usdc.mint(amount);
    expect(await usdc.balanceOf(deployer.address)).eq(amount);

    const targets = [parifiFairsaleAdapter.address];
    const data = [
      defaultAbiCoder.encode(
        ["address", "uint256"],
        [deployer.address, amount]
      ),
    ];
    const value = [0];
    const callType = [2];

    const assetForwarderData = defaultAbiCoder.encode(
      ["uint256", "address", "address[]", "uint256[]", "uint256[]", "bytes[]"],
      [0, deployer.address, targets, value, callType, data]
    );

    const userContributionBefore = await parifiFairsaleContract.contributions(
      deployer.address
    );

    await usdc.approve(mockAssetForwarder.address, amount);
    await mockAssetForwarder.handleMessage(
      USDC,
      amount,
      assetForwarderData,
      batchTransaction.address
    );

    const userContributionAfter = await parifiFairsaleContract.contributions(
      deployer.address
    );
    expect(userContributionBefore).eq(0);
    expect(userContributionAfter).eq(amount);
  });
});
