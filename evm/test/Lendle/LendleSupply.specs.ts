/* eslint-disable no-unused-vars */
import hardhat, { ethers, waffle } from "hardhat";
import { expect } from "chai";
import { RPC } from "../constants";
import { DEXSPAN, DEFAULT_ENV } from "../../tasks/constants";
import { TokenInterface__factory } from "../../typechain/factories/TokenInterface__factory";
import { MockAssetForwarder__factory } from "../../typechain/factories/MockAssetForwarder__factory";
import { BatchTransaction__factory } from "../../typechain/factories/BatchTransaction__factory";
import { LendleSupply__factory } from "../../typechain/factories/LendleSupply__factory";
import { defaultAbiCoder } from "ethers/lib/utils";
import { zeroAddress } from "ethereumjs-util";

const CHAIN_ID = "5000";
const LENDLE_POOL = "0xCFa5aE7c2CE8Fadc6426C1ff872cA45378Fb7cF3";
const LENDLE_WRAPPED_TOKEN_GATEWAY =
  "0xEc831f8710C6286a91a348928600157f07aC55c2";
const LENDLE_REFERRAL_CODE = 0;
const NATIVE_TOKEN = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const WETH = "0x78c1b0c915c4faa5fffa6cabf0219da63d7f4cb8";
const L_WETH_ADDRESS = "0x683696523512636B46A826A7e3D1B0658E8e2e1c";

describe("LendleSupply Adapter: ", async () => {
  const [deployer, alice] = waffle.provider.getWallets();

  const setupTests = async () => {
    let env = process.env.ENV;
    if (!env) env = DEFAULT_ENV;
    const MockAssetForwarder = await ethers.getContractFactory(
      "MockAssetForwarder"
    );
    const mockAssetForwarder = await MockAssetForwarder.deploy();

    const LendleSupplyAdapter = await ethers.getContractFactory("LendleSupply");

    const lendleSupplyAdapter = await LendleSupplyAdapter.deploy(
      NATIVE_TOKEN,
      WETH,
      LENDLE_POOL,
      LENDLE_WRAPPED_TOKEN_GATEWAY,
      LENDLE_REFERRAL_CODE
    );

    const BatchTransaction = await ethers.getContractFactory(
      "BatchTransaction"
    );

    const batchTransaction = await BatchTransaction.deploy(
      NATIVE_TOKEN,
      WETH,
      mockAssetForwarder.address,
      DEXSPAN[env][CHAIN_ID],
      zeroAddress()
    );

    await batchTransaction.setAdapterWhitelist(
      [lendleSupplyAdapter.address],
      [true]
    );

    const weth = TokenInterface__factory.connect(WETH, deployer);
    const lWeth = TokenInterface__factory.connect(L_WETH_ADDRESS, deployer);

    const MockToken = await ethers.getContractFactory("MockToken");
    const mockToken = await MockToken.deploy();
    await mockToken.mint(deployer.address, ethers.utils.parseEther("10000"));

    return {
      lendleSupplyAdapter: LendleSupply__factory.connect(
        lendleSupplyAdapter.address,
        deployer
      ),
      batchTransaction: BatchTransaction__factory.connect(
        batchTransaction.address,
        deployer
      ),
      weth,
      lWeth,
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

  it("Can supply native tokens on Lendle", async () => {
    const { lendleSupplyAdapter, lWeth } = await setupTests();

    const amount = ethers.utils.parseEther("1");

    const data = defaultAbiCoder.encode(
      ["address", "address", "uint256"],
      [NATIVE_TOKEN, deployer.address, amount]
    );

    const userBalBefore = await lWeth.balanceOf(deployer.address);
    await lendleSupplyAdapter.execute(data, {
      gasLimit: 10000000,
      value: amount,
    });

    const userBalAfter = await lWeth.balanceOf(deployer.address);

    expect(userBalBefore).eq(0);
    expect(userBalAfter).gt(0);
  });

  it("Can supply non-native tokens on Lendle", async () => {
    const { lendleSupplyAdapter, weth, lWeth } = await setupTests();

    const amount = ethers.utils.parseEther("1");
    await weth.deposit({ value: amount });
    expect(await weth.balanceOf(deployer.address)).eq(amount);

    await weth.approve(lendleSupplyAdapter.address, amount);
    const data = defaultAbiCoder.encode(
      ["address", "address", "uint256"],
      [weth.address, deployer.address, amount]
    );

    const userBalBefore = await lWeth.balanceOf(deployer.address);
    await lendleSupplyAdapter.execute(data, {
      gasLimit: 10000000,
    });
    const userBalAfter = await lWeth.balanceOf(deployer.address);

    expect(userBalBefore).eq(0);
    expect(userBalAfter).gt(0);
  });

  it("Cannot supply unsupported tokens on Lendle", async () => {
    const { lendleSupplyAdapter, mockToken } = await setupTests();

    const amount = ethers.utils.parseEther("1");
    await mockToken.approve(lendleSupplyAdapter.address, amount);

    const data = defaultAbiCoder.encode(
      ["address", "address", "uint256"],
      [mockToken.address, deployer.address, amount]
    );

    await expect(
      lendleSupplyAdapter.execute(data, {
        gasLimit: 10000000,
      })
    ).to.be.reverted;
  });

  it("Can supply non-native tokens on Lendle using BatchTransaction flow", async () => {
    const { lendleSupplyAdapter, weth, lWeth, batchTransaction } =
      await setupTests();

    const amount = ethers.utils.parseEther("1");
    await weth.deposit({ value: amount });
    expect(await weth.balanceOf(deployer.address)).eq(amount);

    await weth.approve(batchTransaction.address, amount);

    const lendleSupplyData = defaultAbiCoder.encode(
      ["address", "address", "uint256"],
      [WETH, alice.address, amount]
    );

    const tokens = [WETH];
    const amounts = [amount];
    const targets = [lendleSupplyAdapter.address];
    const data = [lendleSupplyData];
    const value = [0];
    const callType = [2];
    const feeInfo = [{ fee: 0, recipient: zeroAddress() }];

    const userBalBefore = await lWeth.balanceOf(alice.address);
    await batchTransaction.executeBatchCallsSameChain(
      0,
      tokens,
      amounts,
      feeInfo,
      targets,
      value,
      callType,
      data
    );

    const userBalAfter = await lWeth.balanceOf(alice.address);

    expect(userBalBefore).eq(0);
    expect(userBalAfter).gt(0);
  });

  it("Cannot supply unsupported tokens on Lendle using BatchTransaction flow", async () => {
    const { lendleSupplyAdapter, mockToken, batchTransaction } =
      await setupTests();

    const amount = ethers.utils.parseEther("1");
    await mockToken.approve(batchTransaction.address, amount);

    const lendleSupplyData = defaultAbiCoder.encode(
      ["address", "address", "uint256"],
      [mockToken.address, alice.address, amount]
    );

    const tokens = [mockToken.address];
    const amounts = [amount];
    const targets = [lendleSupplyAdapter.address];
    const data = [lendleSupplyData];
    const value = [0];
    const callType = [2];
    const feeInfo = [{ fee: 0, recipient: zeroAddress() }];

    await expect(
      batchTransaction.executeBatchCallsSameChain(
        0,
        tokens,
        amounts,
        feeInfo,
        targets,
        value,
        callType,
        data
      )
    ).to.be.reverted;
  });

  it("Can supply native tokens cross-chain on Lendle using BatchTransaction flow", async () => {
    const { lendleSupplyAdapter, mockAssetForwarder, lWeth, batchTransaction } =
      await setupTests();

    const amount = ethers.utils.parseEther("1");

    const lendleSupplyData = defaultAbiCoder.encode(
      ["address", "address", "uint256"],
      [NATIVE_TOKEN, alice.address, amount]
    );

    const targets = [lendleSupplyAdapter.address];
    const data = [lendleSupplyData];
    const value = [0];
    const callType = [2];

    const assetForwarderData = defaultAbiCoder.encode(
      ["uint256", "address", "address[]", "uint256[]", "uint256[]", "bytes[]"],
      [0, deployer.address, targets, value, callType, data]
    );

    const userBalBefore = await lWeth.balanceOf(alice.address);
    await mockAssetForwarder.handleMessage(
      NATIVE_TOKEN,
      amount,
      assetForwarderData,
      batchTransaction.address,
      { value: amount, gasLimit: 10000000 }
    );
    const userBalAfter = await lWeth.balanceOf(alice.address);

    expect(userBalBefore).eq(0);
    expect(userBalAfter).gt(0);
  });

  it("Can supply non-native tokens cross-chain on Lendle using BatchTransaction flow", async () => {
    const {
      lendleSupplyAdapter,
      mockAssetForwarder,
      weth,
      lWeth,
      batchTransaction,
    } = await setupTests();

    const amount = ethers.utils.parseEther("1");
    await weth.deposit({ value: amount });
    expect(await weth.balanceOf(deployer.address)).eq(amount);

    await weth.approve(mockAssetForwarder.address, amount);

    const lendleSupplyData = defaultAbiCoder.encode(
      ["address", "address", "uint256"],
      [weth.address, alice.address, amount]
    );

    const targets = [lendleSupplyAdapter.address];
    const data = [lendleSupplyData];
    const value = [0];
    const callType = [2];

    const assetForwarderData = defaultAbiCoder.encode(
      ["uint256", "address", "address[]", "uint256[]", "uint256[]", "bytes[]"],
      [0, deployer.address, targets, value, callType, data]
    );

    const userBalBefore = await lWeth.balanceOf(alice.address);
    await mockAssetForwarder.handleMessage(
      weth.address,
      amount,
      assetForwarderData,
      batchTransaction.address,
      { value: amount, gasLimit: 10000000 }
    );
    const userBalAfter = await lWeth.balanceOf(alice.address);

    expect(userBalBefore).eq(0);
    expect(userBalAfter).gt(0);
  });

  it("Can get a refund if supply unsupported tokens cross-chain on Lendle using BatchTransaction flow", async () => {
    const {
      lendleSupplyAdapter,
      mockAssetForwarder,
      mockToken,
      lWeth,
      batchTransaction,
    } = await setupTests();

    const amount = ethers.utils.parseEther("1");
    await mockToken.approve(mockAssetForwarder.address, amount);

    const lendleSupplyData = defaultAbiCoder.encode(
      ["address", "address", "uint256"],
      [mockToken.address, alice.address, amount]
    );

    const targets = [lendleSupplyAdapter.address];
    const data = [lendleSupplyData];
    const value = [0];
    const callType = [2];

    const assetForwarderData = defaultAbiCoder.encode(
      ["uint256", "address", "address[]", "uint256[]", "uint256[]", "bytes[]"],
      [0, deployer.address, targets, value, callType, data]
    );

    const recipientBalBefore = await lWeth.balanceOf(alice.address);
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

    const recipientBalAfter = await lWeth.balanceOf(alice.address);
    const userMockTokenBalAfter = await mockToken.balanceOf(deployer.address);

    expect(recipientBalAfter).eq(recipientBalBefore);
    expect(userMockTokenBalAfter).eq(userMockTokenBalBefore);
  });
});
