import hardhat, { ethers, waffle } from "hardhat";
import { expect } from "chai";
import { RPC } from "../constants";
import { DEXSPAN, DEFAULT_ENV } from "../../tasks/constants";
import { TokenInterface__factory } from "../../typechain/factories/TokenInterface__factory";
import { MockAssetForwarder__factory } from "../../typechain/factories/MockAssetForwarder__factory";
import { BatchTransaction__factory } from "../../typechain/factories/BatchTransaction__factory";
import { CompoundSupply__factory } from "../../typechain/factories/CompoundSupply__factory";
import { IComet__factory } from "../../typechain/factories/IComet__factory";
import { defaultAbiCoder } from "ethers/lib/utils";
import { zeroAddress } from "ethereumjs-util";

const CHAIN_ID = "5";
const COMPOUND_USDC_POOL = "0x3EE77595A8459e93C2888b13aDB354017B198188";
const COMPOUND_WETH_POOL = "0x9A539EEc489AAA03D588212a164d0abdB5F08F5F";
const NATIVE_TOKEN = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const WETH = "0x42a71137C09AE83D8d05974960fd607d40033499";
const C_WETH_ADDRESS = "0x9A539EEc489AAA03D588212a164d0abdB5F08F5F";
const C_USDC_ADDRESS = "0x3EE77595A8459e93C2888b13aDB354017B198188";
const USDC = "0x07865c6E87B9F70255377e024ace6630C1Eaa37F";

describe("CompoundSupply Adapter: ", async () => {
  const [deployer, alice] = waffle.provider.getWallets();

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
      [compoundSupplyAdapter.address],
      [true]
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

  it("Can supply native tokens on Compound weth market", async () => {
    const { compoundSupplyAdapter, cWeth } = await setupTests();

    const amount = ethers.utils.parseEther("1");

    const data = defaultAbiCoder.encode(
      ["address", "address", "uint256", "address"],
      [NATIVE_TOKEN, deployer.address, amount, WETH]
    );

    const userBalBefore = await cWeth.balanceOf(deployer.address);
    await compoundSupplyAdapter.execute(data, {
      gasLimit: 10000000,
      value: amount,
    });

    const userBalAfter = await cWeth.balanceOf(deployer.address);

    expect(userBalBefore).eq(0);
    expect(userBalAfter).gt(0);
  });

  it("Can supply native tokens on Compound usdc market", async () => {
    const { compoundSupplyAdapter, compoundUSDCPool } = await setupTests();

    const amount = ethers.utils.parseEther("1");

    const data = defaultAbiCoder.encode(
      ["address", "address", "uint256", "address"],
      [NATIVE_TOKEN, deployer.address, amount, USDC]
    );

    await compoundSupplyAdapter.execute(data, {
      gasLimit: 10000000,
      value: amount,
    });

    const collateralBal = await compoundUSDCPool.collateralBalanceOf(
      deployer.address,
      WETH
    );

    expect(collateralBal).gt(0);
  });

  it("Can supply non-native tokens on Compound weth market", async () => {
    const { compoundSupplyAdapter, weth, cWeth } = await setupTests();

    const amount = ethers.utils.parseEther("1");
    await weth.deposit({ value: amount });
    expect(await weth.balanceOf(deployer.address)).eq(amount);

    await weth.approve(compoundSupplyAdapter.address, amount);
    const data = defaultAbiCoder.encode(
      ["address", "address", "uint256", "address"],
      [weth.address, deployer.address, amount, WETH]
    );

    const userBalBefore = await cWeth.balanceOf(deployer.address);
    await compoundSupplyAdapter.execute(data, {
      gasLimit: 10000000,
    });
    const userBalAfter = await cWeth.balanceOf(deployer.address);

    expect(userBalBefore).eq(0);
    expect(userBalAfter).gt(0);
  });

  it("Can supply non-native tokens on Compound usdc market", async () => {
    const { compoundSupplyAdapter, weth, compoundUSDCPool } =
      await setupTests();

    const amount = ethers.utils.parseEther("1");
    await weth.deposit({ value: amount });
    expect(await weth.balanceOf(deployer.address)).eq(amount);

    await weth.approve(compoundSupplyAdapter.address, amount);
    const data = defaultAbiCoder.encode(
      ["address", "address", "uint256", "address"],
      [weth.address, deployer.address, amount, USDC]
    );

    await compoundSupplyAdapter.execute(data, {
      gasLimit: 10000000,
    });
    const collateralBal = await compoundUSDCPool.collateralBalanceOf(
      deployer.address,
      WETH
    );

    expect(collateralBal).gt(0);
  });

  it("Cannot supply unsupported tokens on Compound weth market", async () => {
    const { compoundSupplyAdapter, mockToken } = await setupTests();

    const amount = ethers.utils.parseEther("1");
    await mockToken.approve(compoundSupplyAdapter.address, amount);

    const data = defaultAbiCoder.encode(
      ["address", "address", "uint256", "address"],
      [mockToken.address, deployer.address, amount, WETH]
    );

    await expect(
      compoundSupplyAdapter.execute(data, {
        gasLimit: 10000000,
      })
    ).to.be.reverted;
  });

  it("Cannot supply unsupported tokens on Compound usdc market", async () => {
    const { compoundSupplyAdapter, mockToken } = await setupTests();

    const amount = ethers.utils.parseEther("1");
    await mockToken.approve(compoundSupplyAdapter.address, amount);

    const data = defaultAbiCoder.encode(
      ["address", "address", "uint256", "address"],
      [mockToken.address, deployer.address, amount, USDC]
    );

    await expect(
      compoundSupplyAdapter.execute(data, {
        gasLimit: 10000000,
      })
    ).to.be.reverted;
  });

  it("Cannot supply tokens on Compound- unsupported market", async () => {
    const { compoundSupplyAdapter } = await setupTests();

    const amount = ethers.utils.parseEther("1");

    const data = defaultAbiCoder.encode(
      ["address", "address", "uint256", "address"],
      [NATIVE_TOKEN, deployer.address, amount, NATIVE_TOKEN]
    );

    await expect(
      compoundSupplyAdapter.execute(data, {
        gasLimit: 10000000,
      })
    ).to.be.reverted;
  });

  it("Can supply native tokens on Compound weth market using BatchTransaction flow", async () => {
    const { compoundSupplyAdapter, cWeth, batchTransaction } =
      await setupTests();

    const amount = ethers.utils.parseEther("1");

    const compoundSupplyData = defaultAbiCoder.encode(
      ["address", "address", "uint256", "address"],
      [NATIVE_TOKEN, alice.address, amount, WETH]
    );

    const tokens = [NATIVE_TOKEN];
    const amounts = [amount];
    const targets = [compoundSupplyAdapter.address];
    const data = [compoundSupplyData];
    const value = [0];
    const callType = [2];

    const userBalBefore = await cWeth.balanceOf(alice.address);
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

    const userBalAfter = await cWeth.balanceOf(alice.address);

    expect(userBalBefore).eq(0);
    expect(userBalAfter).gt(0);
  });

  it("Can supply native tokens on Compound usdc market using BatchTransaction flow", async () => {
    const { compoundSupplyAdapter, batchTransaction, compoundUSDCPool } =
      await setupTests();

    const amount = ethers.utils.parseEther("1");

    const compoundSupplyData = defaultAbiCoder.encode(
      ["address", "address", "uint256", "address"],
      [NATIVE_TOKEN, alice.address, amount, USDC]
    );

    const tokens = [NATIVE_TOKEN];
    const amounts = [amount];
    const targets = [compoundSupplyAdapter.address];
    const data = [compoundSupplyData];
    const value = [0];
    const callType = [2];

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

    const collateralBal = await compoundUSDCPool.collateralBalanceOf(
      alice.address,
      WETH
    );

    expect(collateralBal).gt(0);
  });

  it("Can supply non-native tokens on Compound weth market using BatchTransaction flow", async () => {
    const { compoundSupplyAdapter, weth, cWeth, batchTransaction } =
      await setupTests();

    const amount = ethers.utils.parseEther("1");
    await weth.deposit({ value: amount });
    expect(await weth.balanceOf(deployer.address)).eq(amount);

    await weth.approve(batchTransaction.address, amount);

    const compoundSupplyData = defaultAbiCoder.encode(
      ["address", "address", "uint256", "address"],
      [WETH, alice.address, amount, WETH]
    );

    const tokens = [WETH];
    const amounts = [amount];
    const targets = [compoundSupplyAdapter.address];
    const data = [compoundSupplyData];
    const value = [0];
    const callType = [2];

    const userBalBefore = await cWeth.balanceOf(alice.address);
    await batchTransaction.executeBatchCallsSameChain(
      0,
      tokens,
      amounts,
      targets,
      value,
      callType,
      data
    );

    const userBalAfter = await cWeth.balanceOf(alice.address);

    expect(userBalBefore).eq(0);
    expect(userBalAfter).gt(0);
  });

  it("Can supply non-native tokens on Compound usdc market using BatchTransaction flow", async () => {
    const { compoundSupplyAdapter, weth, batchTransaction, compoundUSDCPool } =
      await setupTests();

    const amount = ethers.utils.parseEther("1");
    await weth.deposit({ value: amount });
    expect(await weth.balanceOf(deployer.address)).eq(amount);

    await weth.approve(batchTransaction.address, amount);

    const compoundSupplyData = defaultAbiCoder.encode(
      ["address", "address", "uint256", "address"],
      [WETH, alice.address, amount, USDC]
    );

    const tokens = [WETH];
    const amounts = [amount];
    const targets = [compoundSupplyAdapter.address];
    const data = [compoundSupplyData];
    const value = [0];
    const callType = [2];

    await batchTransaction.executeBatchCallsSameChain(
      0,
      tokens,
      amounts,
      targets,
      value,
      callType,
      data
    );

    const collateralBal = await compoundUSDCPool.collateralBalanceOf(
      alice.address,
      WETH
    );

    expect(collateralBal).gt(0);
  });

  it("Cannot supply unsupported tokens on Compound weth market using BatchTransaction flow", async () => {
    const { compoundSupplyAdapter, mockToken, batchTransaction } =
      await setupTests();

    const amount = ethers.utils.parseEther("1");
    await mockToken.approve(batchTransaction.address, amount);

    const compoundSupplyData = defaultAbiCoder.encode(
      ["address", "address", "uint256", "address"],
      [mockToken.address, alice.address, amount, WETH]
    );

    const tokens = [mockToken.address];
    const amounts = [amount];
    const targets = [compoundSupplyAdapter.address];
    const data = [compoundSupplyData];
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

  it("Cannot supply unsupported tokens on Compound usdc market using BatchTransaction flow", async () => {
    const { compoundSupplyAdapter, mockToken, batchTransaction } =
      await setupTests();

    const amount = ethers.utils.parseEther("1");
    await mockToken.approve(batchTransaction.address, amount);

    const compoundSupplyData = defaultAbiCoder.encode(
      ["address", "address", "uint256", "address"],
      [mockToken.address, alice.address, amount, USDC]
    );

    const tokens = [mockToken.address];
    const amounts = [amount];
    const targets = [compoundSupplyAdapter.address];
    const data = [compoundSupplyData];
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

  it("Cannot supply tokens on unsupported market on Compound using BatchTransaction flow", async () => {
    const { compoundSupplyAdapter, batchTransaction } = await setupTests();

    const amount = ethers.utils.parseEther("1");

    const compoundSupplyData = defaultAbiCoder.encode(
      ["address", "address", "uint256", "address"],
      [NATIVE_TOKEN, alice.address, amount, NATIVE_TOKEN]
    );

    const tokens = [NATIVE_TOKEN];
    const amounts = [amount];
    const targets = [compoundSupplyAdapter.address];
    const data = [compoundSupplyData];
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
        data,
        { value: amount }
      )
    ).to.be.reverted;
  });

  it("Can supply native tokens cross-chain on Compound weth market using BatchTransaction flow", async () => {
    const {
      compoundSupplyAdapter,
      mockAssetForwarder,
      cWeth,
      batchTransaction,
    } = await setupTests();

    const amount = ethers.utils.parseEther("1");

    const compoundSupplyData = defaultAbiCoder.encode(
      ["address", "address", "uint256", "address"],
      [NATIVE_TOKEN, alice.address, amount, WETH]
    );

    const targets = [compoundSupplyAdapter.address];
    const data = [compoundSupplyData];
    const value = [0];
    const callType = [2];

    const assetForwarderData = defaultAbiCoder.encode(
      ["uint256", "address", "address[]", "uint256[]", "uint256[]", "bytes[]"],
      [0, deployer.address, targets, value, callType, data]
    );

    const userBalBefore = await cWeth.balanceOf(alice.address);
    await mockAssetForwarder.handleMessage(
      NATIVE_TOKEN,
      amount,
      assetForwarderData,
      batchTransaction.address,
      { value: amount, gasLimit: 10000000 }
    );
    const userBalAfter = await cWeth.balanceOf(alice.address);

    expect(userBalBefore).eq(0);
    expect(userBalAfter).gt(0);
  });

  it("Can supply native tokens cross-chain on Compound usdc market using BatchTransaction flow", async () => {
    const {
      compoundSupplyAdapter,
      mockAssetForwarder,
      batchTransaction,
      compoundUSDCPool,
    } = await setupTests();

    const amount = ethers.utils.parseEther("1");

    const compoundSupplyData = defaultAbiCoder.encode(
      ["address", "address", "uint256", "address"],
      [NATIVE_TOKEN, alice.address, amount, USDC]
    );

    const targets = [compoundSupplyAdapter.address];
    const data = [compoundSupplyData];
    const value = [0];
    const callType = [2];

    const assetForwarderData = defaultAbiCoder.encode(
      ["uint256", "address", "address[]", "uint256[]", "uint256[]", "bytes[]"],
      [0, deployer.address, targets, value, callType, data]
    );
    await mockAssetForwarder.handleMessage(
      NATIVE_TOKEN,
      amount,
      assetForwarderData,
      batchTransaction.address,
      { value: amount, gasLimit: 10000000 }
    );

    const collateralBal = await compoundUSDCPool.collateralBalanceOf(
      alice.address,
      WETH
    );

    expect(collateralBal).gt(0);
  });

  it("Can supply non-native tokens cross-chain on Compound weth market using BatchTransaction flow", async () => {
    const {
      compoundSupplyAdapter,
      mockAssetForwarder,
      weth,
      cWeth,
      batchTransaction,
    } = await setupTests();

    const amount = ethers.utils.parseEther("1");
    await weth.deposit({ value: amount });
    expect(await weth.balanceOf(deployer.address)).eq(amount);

    await weth.approve(mockAssetForwarder.address, amount);

    const compoundSupplyData = defaultAbiCoder.encode(
      ["address", "address", "uint256", "address"],
      [weth.address, alice.address, amount, WETH]
    );

    const targets = [compoundSupplyAdapter.address];
    const data = [compoundSupplyData];
    const value = [0];
    const callType = [2];

    const assetForwarderData = defaultAbiCoder.encode(
      ["uint256", "address", "address[]", "uint256[]", "uint256[]", "bytes[]"],
      [0, deployer.address, targets, value, callType, data]
    );

    const userBalBefore = await cWeth.balanceOf(alice.address);
    await mockAssetForwarder.handleMessage(
      weth.address,
      amount,
      assetForwarderData,
      batchTransaction.address,
      { value: amount, gasLimit: 10000000 }
    );
    const userBalAfter = await cWeth.balanceOf(alice.address);

    expect(userBalBefore).eq(0);
    expect(userBalAfter).gt(0);
  });

  it("Can supply non-native tokens cross-chain on Compound usdc market using BatchTransaction flow", async () => {
    const {
      compoundSupplyAdapter,
      mockAssetForwarder,
      weth,
      batchTransaction,
      compoundUSDCPool,
    } = await setupTests();

    const amount = ethers.utils.parseEther("1");
    await weth.deposit({ value: amount });
    expect(await weth.balanceOf(deployer.address)).eq(amount);

    await weth.approve(mockAssetForwarder.address, amount);

    const compoundSupplyData = defaultAbiCoder.encode(
      ["address", "address", "uint256", "address"],
      [weth.address, alice.address, amount, USDC]
    );

    const targets = [compoundSupplyAdapter.address];
    const data = [compoundSupplyData];
    const value = [0];
    const callType = [2];

    const assetForwarderData = defaultAbiCoder.encode(
      ["uint256", "address", "address[]", "uint256[]", "uint256[]", "bytes[]"],
      [0, deployer.address, targets, value, callType, data]
    );

    await mockAssetForwarder.handleMessage(
      weth.address,
      amount,
      assetForwarderData,
      batchTransaction.address,
      { value: amount, gasLimit: 10000000 }
    );

    const collateralBal = await compoundUSDCPool.collateralBalanceOf(
      alice.address,
      WETH
    );

    expect(collateralBal).gt(0);
  });

  it("Can get a refund if supply unsupported tokens cross-chain on Compound weth market using BatchTransaction flow", async () => {
    const {
      compoundSupplyAdapter,
      mockAssetForwarder,
      mockToken,
      cWeth,
      batchTransaction,
    } = await setupTests();

    const amount = ethers.utils.parseEther("1");
    await mockToken.approve(mockAssetForwarder.address, amount);

    const compoundSupplyData = defaultAbiCoder.encode(
      ["address", "address", "uint256", "address"],
      [mockToken.address, alice.address, amount, WETH]
    );

    const targets = [compoundSupplyAdapter.address];
    const data = [compoundSupplyData];
    const value = [0];
    const callType = [2];

    const assetForwarderData = defaultAbiCoder.encode(
      ["uint256", "address", "address[]", "uint256[]", "uint256[]", "bytes[]"],
      [0, deployer.address, targets, value, callType, data]
    );

    const recipientBalBefore = await cWeth.balanceOf(alice.address);
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

    const recipientBalAfter = await cWeth.balanceOf(alice.address);
    const userMockTokenBalAfter = await mockToken.balanceOf(deployer.address);

    expect(recipientBalAfter).eq(recipientBalBefore);
    expect(userMockTokenBalAfter).eq(userMockTokenBalBefore);
  });

  it("Can get a refund if supply unsupported tokens cross-chain on Compound usdc market using BatchTransaction flow", async () => {
    const {
      compoundSupplyAdapter,
      mockAssetForwarder,
      mockToken,
      cWeth,
      batchTransaction,
    } = await setupTests();

    const amount = ethers.utils.parseEther("1");
    await mockToken.approve(mockAssetForwarder.address, amount);

    const compoundSupplyData = defaultAbiCoder.encode(
      ["address", "address", "uint256", "address"],
      [mockToken.address, alice.address, amount, USDC]
    );

    const targets = [compoundSupplyAdapter.address];
    const data = [compoundSupplyData];
    const value = [0];
    const callType = [2];

    const assetForwarderData = defaultAbiCoder.encode(
      ["uint256", "address", "address[]", "uint256[]", "uint256[]", "bytes[]"],
      [0, deployer.address, targets, value, callType, data]
    );

    const recipientBalBefore = await cWeth.balanceOf(alice.address);
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

    const recipientBalAfter = await cWeth.balanceOf(alice.address);
    const userMockTokenBalAfter = await mockToken.balanceOf(deployer.address);

    expect(recipientBalAfter).eq(recipientBalBefore);
    expect(userMockTokenBalAfter).eq(userMockTokenBalBefore);
  });

  it("Cannot supply non-native tokens cross-chain on Compound unsupported market using BatchTransaction flow", async () => {
    const {
      compoundSupplyAdapter,
      mockAssetForwarder,
      weth,
      batchTransaction,
    } = await setupTests();

    const amount = ethers.utils.parseEther("1");
    await weth.deposit({ value: amount });
    expect(await weth.balanceOf(deployer.address)).eq(amount);

    await weth.approve(mockAssetForwarder.address, amount);

    const compoundSupplyData = defaultAbiCoder.encode(
      ["address", "address", "uint256", "address"],
      [weth.address, alice.address, amount, NATIVE_TOKEN]
    );

    const targets = [compoundSupplyAdapter.address];
    const data = [compoundSupplyData];
    const value = [0];
    const callType = [2];

    const assetForwarderData = defaultAbiCoder.encode(
      ["uint256", "address", "address[]", "uint256[]", "uint256[]", "bytes[]"],
      [0, deployer.address, targets, value, callType, data]
    );

    expect(
      await mockAssetForwarder.handleMessage(
        weth.address,
        amount,
        assetForwarderData,
        batchTransaction.address,
        { value: amount, gasLimit: 10000000 }
      )
    ).to.emit("OperationFailedRefundEvent");
  });
});
