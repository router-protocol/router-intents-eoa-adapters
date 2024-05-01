/* eslint-disable no-unused-vars */
import hardhat, { ethers, waffle } from "hardhat";
import { expect } from "chai";
import { RPC } from "../constants";
import { DEXSPAN, DEFAULT_ENV } from "../../tasks/constants";
import { TokenInterface__factory } from "../../typechain/factories/TokenInterface__factory";
import { MockAssetForwarder__factory } from "../../typechain/factories/MockAssetForwarder__factory";
import { BatchTransaction__factory } from "../../typechain/factories/BatchTransaction__factory";
import { RadiantSupply__factory } from "../../typechain/factories/RadiantSupply__factory";
import { defaultAbiCoder } from "ethers/lib/utils";
import { zeroAddress } from "ethereumjs-util";

const CHAIN_ID = "1";
const RADIANT_POOL = "0xA950974f64aA33f27F6C5e017eEE93BF7588ED07";
const RADIANT_WRAPPED_TOKEN_GATEWAY =
  "0xc46963a9EAF81f5BEB0B11413687f87a874E2D13";
const RADIANT_REFERRAL_CODE = 0;
const NATIVE_TOKEN = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
const R_WETH_ADDRESS = "0xd10c315293872851184F484E9431dAf4dE6AA992";
const USDC_VARIABLE_DEBT_TOKEN = "0x490726291F6434646FEb2eC96d2Cc566b18a122F";
const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";

describe("RadiantSupply Adapter: ", async () => {
  const [deployer, alice] = waffle.provider.getWallets();

  const setupTests = async () => {
    let env = process.env.ENV;
    if (!env) env = DEFAULT_ENV;
    const MockAssetForwarder = await ethers.getContractFactory(
      "MockAssetForwarder"
    );
    const mockAssetForwarder = await MockAssetForwarder.deploy();

    const RadiantSupplyAdapter = await ethers.getContractFactory(
      "RadiantSupply"
    );

    const radiantSupplyAdapter = await RadiantSupplyAdapter.deploy(
      NATIVE_TOKEN,
      WETH,
      RADIANT_POOL,
      RADIANT_WRAPPED_TOKEN_GATEWAY,
      RADIANT_REFERRAL_CODE
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
      [radiantSupplyAdapter.address],
      [true]
    );

    const weth = TokenInterface__factory.connect(WETH, deployer);
    const rWeth = TokenInterface__factory.connect(R_WETH_ADDRESS, deployer);

    const MockToken = await ethers.getContractFactory("MockToken");
    const mockToken = await MockToken.deploy();
    await mockToken.mint(deployer.address, ethers.utils.parseEther("10000"));

    return {
      radiantSupplyAdapter: RadiantSupply__factory.connect(
        radiantSupplyAdapter.address,
        deployer
      ),
      batchTransaction: BatchTransaction__factory.connect(
        batchTransaction.address,
        deployer
      ),
      weth,
      rWeth,
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

  it("Can supply native tokens on Radiant", async () => {
    const { radiantSupplyAdapter, rWeth } = await setupTests();

    const amount = ethers.utils.parseEther("1");

    const data = defaultAbiCoder.encode(
      ["address", "address", "uint256"],
      [NATIVE_TOKEN, deployer.address, amount]
    );

    const userBalBefore = await rWeth.balanceOf(deployer.address);
    await radiantSupplyAdapter.execute(data, {
      gasLimit: 10000000,
      value: amount,
    });

    const userBalAfter = await rWeth.balanceOf(deployer.address);

    expect(userBalBefore).eq(0);
    expect(userBalAfter).gt(0);
  });

  it("Can supply non-native tokens on Radiant", async () => {
    const { radiantSupplyAdapter, weth, rWeth } = await setupTests();

    const amount = ethers.utils.parseEther("1");
    await weth.deposit({ value: amount });
    expect(await weth.balanceOf(deployer.address)).eq(amount);

    await weth.approve(radiantSupplyAdapter.address, amount);
    const data = defaultAbiCoder.encode(
      ["address", "address", "uint256"],
      [weth.address, deployer.address, amount]
    );

    const userBalBefore = await rWeth.balanceOf(deployer.address);
    await radiantSupplyAdapter.execute(data, {
      gasLimit: 10000000,
    });
    const userBalAfter = await rWeth.balanceOf(deployer.address);

    expect(userBalBefore).eq(0);
    expect(userBalAfter).gt(0);
  });

  it("Cannot supply unsupported tokens on Radiant", async () => {
    const { radiantSupplyAdapter, mockToken } = await setupTests();

    const amount = ethers.utils.parseEther("1");
    await mockToken.approve(radiantSupplyAdapter.address, amount);

    const data = defaultAbiCoder.encode(
      ["address", "address", "uint256"],
      [mockToken.address, deployer.address, amount]
    );

    await expect(
      radiantSupplyAdapter.execute(data, {
        gasLimit: 10000000,
      })
    ).to.be.reverted;
  });

  it("Can supply non-native tokens on Radiant using BatchTransaction flow", async () => {
    const { radiantSupplyAdapter, weth, rWeth, batchTransaction } =
      await setupTests();

    const amount = ethers.utils.parseEther("1");
    await weth.deposit({ value: amount });
    expect(await weth.balanceOf(deployer.address)).eq(amount);

    await weth.approve(batchTransaction.address, amount);

    const radiantSupplyData = defaultAbiCoder.encode(
      ["address", "address", "uint256"],
      [WETH, alice.address, amount]
    );

    const tokens = [WETH];
    const amounts = [amount];
    const targets = [radiantSupplyAdapter.address];
    const data = [radiantSupplyData];
    const value = [0];
    const callType = [2];

    const userBalBefore = await rWeth.balanceOf(alice.address);
    await batchTransaction.executeBatchCallsSameChain(
      0,
      tokens,
      amounts,
      targets,
      value,
      callType,
      data
    );

    const userBalAfter = await rWeth.balanceOf(alice.address);

    expect(userBalBefore).eq(0);
    expect(userBalAfter).gt(0);
  });

  it("Cannot supply unsupported tokens on Radiant using BatchTransaction flow", async () => {
    const { radiantSupplyAdapter, mockToken, batchTransaction } =
      await setupTests();

    const amount = ethers.utils.parseEther("1");
    await mockToken.approve(batchTransaction.address, amount);

    const radiantSupplyData = defaultAbiCoder.encode(
      ["address", "address", "uint256"],
      [mockToken.address, alice.address, amount]
    );

    const tokens = [mockToken.address];
    const amounts = [amount];
    const targets = [radiantSupplyAdapter.address];
    const data = [radiantSupplyData];
    const value = [0];
    const callType = [2];

    await expect(
      batchTransaction.executeBatchCallsSameChain(
        0,
        tokens,
        amounts,
        targets,
        value,
        callType,
        data
      )
    ).to.be.reverted;
  });

  it("Can supply native tokens cross-chain on Radiant using BatchTransaction flow", async () => {
    const {
      radiantSupplyAdapter,
      mockAssetForwarder,
      rWeth,
      batchTransaction,
    } = await setupTests();

    const amount = ethers.utils.parseEther("1");

    const radiantSupplyData = defaultAbiCoder.encode(
      ["address", "address", "uint256"],
      [NATIVE_TOKEN, alice.address, amount]
    );

    const targets = [radiantSupplyAdapter.address];
    const data = [radiantSupplyData];
    const value = [0];
    const callType = [2];

    const assetForwarderData = defaultAbiCoder.encode(
      ["uint256", "address", "address[]", "uint256[]", "uint256[]", "bytes[]"],
      [0, deployer.address, targets, value, callType, data]
    );

    const userBalBefore = await rWeth.balanceOf(alice.address);
    await mockAssetForwarder.handleMessage(
      NATIVE_TOKEN,
      amount,
      assetForwarderData,
      batchTransaction.address,
      { value: amount, gasLimit: 10000000 }
    );
    const userBalAfter = await rWeth.balanceOf(alice.address);

    expect(userBalBefore).eq(0);
    expect(userBalAfter).gt(0);
  });

  it("Can supply non-native tokens cross-chain on Radiant using BatchTransaction flow", async () => {
    const {
      radiantSupplyAdapter,
      mockAssetForwarder,
      weth,
      rWeth,
      batchTransaction,
    } = await setupTests();

    const amount = ethers.utils.parseEther("1");
    await weth.deposit({ value: amount });
    expect(await weth.balanceOf(deployer.address)).eq(amount);

    await weth.approve(mockAssetForwarder.address, amount);

    const radiantSupplyData = defaultAbiCoder.encode(
      ["address", "address", "uint256"],
      [weth.address, alice.address, amount]
    );

    const targets = [radiantSupplyAdapter.address];
    const data = [radiantSupplyData];
    const value = [0];
    const callType = [2];

    const assetForwarderData = defaultAbiCoder.encode(
      ["uint256", "address", "address[]", "uint256[]", "uint256[]", "bytes[]"],
      [0, deployer.address, targets, value, callType, data]
    );

    const userBalBefore = await rWeth.balanceOf(alice.address);
    await mockAssetForwarder.handleMessage(
      weth.address,
      amount,
      assetForwarderData,
      batchTransaction.address,
      { value: amount, gasLimit: 10000000 }
    );
    const userBalAfter = await rWeth.balanceOf(alice.address);

    expect(userBalBefore).eq(0);
    expect(userBalAfter).gt(0);
  });

  it("Can get a refund if supply unsupported tokens cross-chain on Radiant using BatchTransaction flow", async () => {
    const {
      radiantSupplyAdapter,
      mockAssetForwarder,
      mockToken,
      rWeth,
      batchTransaction,
    } = await setupTests();

    const amount = ethers.utils.parseEther("1");
    await mockToken.approve(mockAssetForwarder.address, amount);

    const radiantSupplyData = defaultAbiCoder.encode(
      ["address", "address", "uint256"],
      [mockToken.address, alice.address, amount]
    );

    const targets = [radiantSupplyAdapter.address];
    const data = [radiantSupplyData];
    const value = [0];
    const callType = [2];

    const assetForwarderData = defaultAbiCoder.encode(
      ["uint256", "address", "address[]", "uint256[]", "uint256[]", "bytes[]"],
      [0, deployer.address, targets, value, callType, data]
    );

    const recipientBalBefore = await rWeth.balanceOf(alice.address);
    const userMockTokenBalBefore = await mockToken.balanceOf(deployer.address);

    expect(
      await mockAssetForwarder.handleMessage(
        mockToken.address,
        amount,
        assetForwarderData,
        batchTransaction.address,
        { value: amount, gasLimit: 10000000 }
      )
    ).to.emit("OperationFailedRefundEvent");

    const recipientBalAfter = await rWeth.balanceOf(alice.address);
    const userMockTokenBalAfter = await mockToken.balanceOf(deployer.address);

    expect(recipientBalAfter).eq(recipientBalBefore);
    expect(userMockTokenBalAfter).eq(userMockTokenBalBefore);
  });
});
