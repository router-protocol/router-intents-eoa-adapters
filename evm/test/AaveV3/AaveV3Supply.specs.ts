import hardhat, { ethers, waffle } from "hardhat";
import { expect } from "chai";
import { RPC } from "../constants";
import { DEXSPAN, DEFAULT_ENV } from "../../tasks/constants";
import { TokenInterface__factory } from "../../typechain/factories/TokenInterface__factory";
import { MockAssetForwarder__factory } from "../../typechain/factories/MockAssetForwarder__factory";
import { BatchTransaction__factory } from "../../typechain/factories/BatchTransaction__factory";
import { AaveV3Supply__factory } from "../../typechain/factories/AaveV3Supply__factory";
import { defaultAbiCoder } from "ethers/lib/utils";
import { zeroAddress } from "ethereumjs-util";

const CHAIN_ID = "80001";
const AAVE_V3_POOL = "0xcC6114B983E4Ed2737E9BD3961c9924e6216c704";
const AAVE_V3_WRAPPED_TOKEN_GATEWAY =
  "0x8dA9412AbB78db20d0B496573D9066C474eA21B8";
const AAVE_V3_REFERRAL_CODE = 0;
const NATIVE_TOKEN = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const WMATIC = "0xaD3C5a67275dE4b5554CdD1d961e957f408eF75a";
const A_WMATIC_ADDRESS = "0xaCA5e6a7117F54B34B476aB95Bf3034c304e7a81";

describe("AaveV3Supply Adapter: ", async () => {
  const [deployer, alice] = waffle.provider.getWallets();

  const setupTests = async () => {
    let env = process.env.ENV;
    if (!env) env = DEFAULT_ENV;
    const MockAssetForwarder = await ethers.getContractFactory(
      "MockAssetForwarder"
    );
    const mockAssetForwarder = await MockAssetForwarder.deploy();

    const AaveV3SupplyAdapter = await ethers.getContractFactory("AaveV3Supply");

    const aaveV3SupplyAdapter = await AaveV3SupplyAdapter.deploy(
      NATIVE_TOKEN,
      WMATIC,
      AAVE_V3_POOL,
      AAVE_V3_WRAPPED_TOKEN_GATEWAY,
      AAVE_V3_REFERRAL_CODE
    );

    const BatchTransaction = await ethers.getContractFactory(
      "BatchTransaction"
    );

    const batchTransaction = await BatchTransaction.deploy(
      NATIVE_TOKEN,
      WMATIC,
      mockAssetForwarder.address,
      DEXSPAN[env][CHAIN_ID]
    );

    batchTransaction.setAdapterWhitelist([aaveV3SupplyAdapter.address], [true]);

    const wmatic = TokenInterface__factory.connect(WMATIC, deployer);
    const aWmatic = TokenInterface__factory.connect(A_WMATIC_ADDRESS, deployer);

    const MockToken = await ethers.getContractFactory("MockToken");
    const mockToken = await MockToken.deploy();
    await mockToken.mint(deployer.address, ethers.utils.parseEther("10000"));

    return {
      aaveV3SupplyAdapter: AaveV3Supply__factory.connect(
        aaveV3SupplyAdapter.address,
        deployer
      ),
      batchTransaction: BatchTransaction__factory.connect(
        batchTransaction.address,
        deployer
      ),
      wmatic,
      aWmatic,
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

  it("Can supply native tokens on AaveV3", async () => {
    const { aaveV3SupplyAdapter, aWmatic } = await setupTests();

    const amount = ethers.utils.parseEther("1");

    const data = defaultAbiCoder.encode(
      ["address", "address", "uint256"],
      [NATIVE_TOKEN, deployer.address, amount]
    );

    const userBalBefore = await aWmatic.balanceOf(deployer.address);
    await aaveV3SupplyAdapter.execute(data, {
      gasLimit: 10000000,
      value: amount,
    });

    const userBalAfter = await aWmatic.balanceOf(deployer.address);

    expect(userBalBefore).eq(0);
    expect(userBalAfter).gt(0);
  });

  it("Can supply non-native tokens on AaveV3", async () => {
    const { aaveV3SupplyAdapter, wmatic, aWmatic } = await setupTests();

    const amount = ethers.utils.parseEther("1");
    await wmatic.deposit({ value: amount });
    expect(await wmatic.balanceOf(deployer.address)).eq(amount);

    await wmatic.approve(aaveV3SupplyAdapter.address, amount);
    const data = defaultAbiCoder.encode(
      ["address", "address", "uint256"],
      [wmatic.address, deployer.address, amount]
    );

    const userBalBefore = await aWmatic.balanceOf(deployer.address);
    await aaveV3SupplyAdapter.execute(data, {
      gasLimit: 10000000,
    });
    const userBalAfter = await aWmatic.balanceOf(deployer.address);

    expect(userBalBefore).eq(0);
    expect(userBalAfter).gt(0);
  });

  it("Cannot supply unsupported tokens on AaveV3", async () => {
    const { aaveV3SupplyAdapter, mockToken } = await setupTests();

    const amount = ethers.utils.parseEther("1");
    await mockToken.approve(aaveV3SupplyAdapter.address, amount);

    const data = defaultAbiCoder.encode(
      ["address", "address", "uint256"],
      [mockToken.address, deployer.address, amount]
    );

    await expect(
      aaveV3SupplyAdapter.execute(data, {
        gasLimit: 10000000,
      })
    ).to.be.reverted;
  });

  it("Can supply native tokens on AaveV3 using BatchTransaction flow", async () => {
    const { aaveV3SupplyAdapter, aWmatic, batchTransaction } =
      await setupTests();

    const amount = ethers.utils.parseEther("1");

    const aaveV3SupplyData = defaultAbiCoder.encode(
      ["address", "address", "uint256"],
      [NATIVE_TOKEN, alice.address, amount]
    );

    const tokens = [NATIVE_TOKEN];
    const amounts = [amount];
    const targets = [aaveV3SupplyAdapter.address];
    const data = [aaveV3SupplyData];
    const value = [0];
    const callType = [2];

    const userBalBefore = await aWmatic.balanceOf(alice.address);
    await batchTransaction.executeBatchCallsSameChain(
      0,
      tokens,
      amounts,
      targets,
      value,
      callType,
      data,
      { value: amount }
    );

    const userBalAfter = await aWmatic.balanceOf(alice.address);

    expect(userBalBefore).eq(0);
    expect(userBalAfter).gt(0);
  });

  it("Can supply non-native tokens on AaveV3 using BatchTransaction flow", async () => {
    const { aaveV3SupplyAdapter, wmatic, aWmatic, batchTransaction } =
      await setupTests();

    const amount = ethers.utils.parseEther("1");
    await wmatic.deposit({ value: amount });
    expect(await wmatic.balanceOf(deployer.address)).eq(amount);

    await wmatic.approve(batchTransaction.address, amount);

    const aaveV3SupplyData = defaultAbiCoder.encode(
      ["address", "address", "uint256"],
      [WMATIC, alice.address, amount]
    );

    const tokens = [WMATIC];
    const amounts = [amount];
    const targets = [aaveV3SupplyAdapter.address];
    const data = [aaveV3SupplyData];
    const value = [0];
    const callType = [2];

    const userBalBefore = await aWmatic.balanceOf(alice.address);
    await batchTransaction.executeBatchCallsSameChain(
      0,
      tokens,
      amounts,
      targets,
      value,
      callType,
      data
    );

    const userBalAfter = await aWmatic.balanceOf(alice.address);

    expect(userBalBefore).eq(0);
    expect(userBalAfter).gt(0);
  });

  it("Cannot supply unsupported tokens on AaveV3 using BatchTransaction flow", async () => {
    const { aaveV3SupplyAdapter, mockToken, batchTransaction } =
      await setupTests();

    const amount = ethers.utils.parseEther("1");
    await mockToken.approve(batchTransaction.address, amount);

    const aaveV3SupplyData = defaultAbiCoder.encode(
      ["address", "address", "uint256"],
      [mockToken.address, alice.address, amount]
    );

    const tokens = [mockToken.address];
    const amounts = [amount];
    const targets = [aaveV3SupplyAdapter.address];
    const data = [aaveV3SupplyData];
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

  it("Can supply native tokens cross-chain on AaveV3 using BatchTransaction flow", async () => {
    const {
      aaveV3SupplyAdapter,
      mockAssetForwarder,
      aWmatic,
      batchTransaction,
    } = await setupTests();

    const amount = ethers.utils.parseEther("1");

    const aaveV3SupplyData = defaultAbiCoder.encode(
      ["address", "address", "uint256"],
      [NATIVE_TOKEN, alice.address, amount]
    );

    const targets = [aaveV3SupplyAdapter.address];
    const data = [aaveV3SupplyData];
    const value = [0];
    const callType = [2];

    const assetForwarderData = defaultAbiCoder.encode(
      ["uint256", "address", "address[]", "uint256[]", "uint256[]", "bytes[]"],
      [0, deployer.address, targets, value, callType, data]
    );

    const userBalBefore = await aWmatic.balanceOf(alice.address);
    await mockAssetForwarder.handleMessage(
      NATIVE_TOKEN,
      amount,
      assetForwarderData,
      batchTransaction.address,
      { value: amount, gasLimit: 10000000 }
    );
    const userBalAfter = await aWmatic.balanceOf(alice.address);

    expect(userBalBefore).eq(0);
    expect(userBalAfter).gt(0);
  });

  it("Can supply non-native tokens cross-chain on AaveV3 using BatchTransaction flow", async () => {
    const {
      aaveV3SupplyAdapter,
      mockAssetForwarder,
      wmatic,
      aWmatic,
      batchTransaction,
    } = await setupTests();

    const amount = ethers.utils.parseEther("1");
    await wmatic.deposit({ value: amount });
    expect(await wmatic.balanceOf(deployer.address)).eq(amount);

    await wmatic.approve(mockAssetForwarder.address, amount);

    const aaveV3SupplyData = defaultAbiCoder.encode(
      ["address", "address", "uint256"],
      [wmatic.address, alice.address, amount]
    );

    const targets = [aaveV3SupplyAdapter.address];
    const data = [aaveV3SupplyData];
    const value = [0];
    const callType = [2];

    const assetForwarderData = defaultAbiCoder.encode(
      ["uint256", "address", "address[]", "uint256[]", "uint256[]", "bytes[]"],
      [0, deployer.address, targets, value, callType, data]
    );

    const userBalBefore = await aWmatic.balanceOf(alice.address);
    await mockAssetForwarder.handleMessage(
      wmatic.address,
      amount,
      assetForwarderData,
      batchTransaction.address,
      { value: amount, gasLimit: 10000000 }
    );
    const userBalAfter = await aWmatic.balanceOf(alice.address);

    expect(userBalBefore).eq(0);
    expect(userBalAfter).gt(0);
  });

  it("Can get a refund if supply unsupported tokens cross-chain on AaveV3 using BatchTransaction flow", async () => {
    const {
      aaveV3SupplyAdapter,
      mockAssetForwarder,
      mockToken,
      aWmatic,
      batchTransaction,
    } = await setupTests();

    const amount = ethers.utils.parseEther("1");
    await mockToken.approve(mockAssetForwarder.address, amount);

    const aaveV3SupplyData = defaultAbiCoder.encode(
      ["address", "address", "uint256"],
      [mockToken.address, alice.address, amount]
    );

    const targets = [aaveV3SupplyAdapter.address];
    const data = [aaveV3SupplyData];
    const value = [0];
    const callType = [2];

    const assetForwarderData = defaultAbiCoder.encode(
      ["uint256", "address", "address[]", "uint256[]", "uint256[]", "bytes[]"],
      [0, deployer.address, targets, value, callType, data]
    );

    const recipientBalBefore = await aWmatic.balanceOf(alice.address);
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

    const recipientBalAfter = await aWmatic.balanceOf(alice.address);
    const userMockTokenBalAfter = await mockToken.balanceOf(deployer.address);

    expect(recipientBalAfter).eq(recipientBalBefore);
    expect(userMockTokenBalAfter).eq(userMockTokenBalBefore);
  });
});
