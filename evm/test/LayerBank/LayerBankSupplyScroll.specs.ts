/* eslint-disable no-unused-vars */
import hardhat, { ethers, waffle } from "hardhat";
import { expect } from "chai";
import { RPC } from "../constants";
import { DEXSPAN, DEFAULT_ENV } from "../../tasks/constants";
import { LayerBankSupplyLinea__factory } from "../../typechain/factories/LayerBankSupplyLinea__factory";
import { TokenInterface__factory } from "../../typechain/factories/TokenInterface__factory";
import { MockAssetForwarder__factory } from "../../typechain/factories/MockAssetForwarder__factory";
import { BatchTransaction__factory } from "../../typechain/factories/BatchTransaction__factory";
import { BigNumber, Contract, Wallet } from "ethers";
import { defaultAbiCoder } from "ethers/lib/utils";
import { zeroAddress } from "ethereumjs-util";
import { getTransaction } from "../utils";

const CHAIN_ID = "534352";
const NATIVE_TOKEN = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const LAYER_BANK_CORE = "0xEC53c830f4444a8A56455c6836b5D2aA794289Aa";
const L_ETH = "0x274C3795dadfEbf562932992bF241ae087e0a98C";
const L_USDC = "0x0D8F8e271DD3f2fC58e5716d3Ff7041dBe3F0688";
const WETH = "0x5300000000000000000000000000000000000004";
const USDC = "0x06eFdBFf2a14a7c8E15944D1F4A48F9F95F663A4";
const WST_ETH = "0xf610A9dfB7C89644979b4A0f27063E9e7d7Cda32";

const L_ERC20_TOKEN_ABI = [
  "function transfer(address dst, uint amount) external returns (bool)",
  "function transferFrom(address src, address dst, uint256 amount) external returns (bool)",
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) external view returns (uint)",
  "function balanceOf(address owner) external view returns (uint)",
  "function underlyingBalanceOf(address owner) external returns (uint)",
  "event Approval(address indexed owner, address indexed spender, uint amount)",
];

describe("LayerBank Supply Adapter: ", async () => {
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
      WETH,
      mockAssetForwarder.address,
      DEXSPAN[env][CHAIN_ID]
    );

    const LayerBankAdapter = await ethers.getContractFactory(
      "LayerBankSupplyScroll"
    );

    const layerBankAdapter = await LayerBankAdapter.deploy(
      NATIVE_TOKEN,
      WETH,
      LAYER_BANK_CORE,
      USDC,
      WST_ETH
    );

    await batchTransaction.setAdapterWhitelist(
      [layerBankAdapter.address],
      [true]
    );

    const lEth = TokenInterface__factory.connect(L_ETH, deployer);
    const lUsdc = TokenInterface__factory.connect(L_USDC, deployer);
    const usdc = TokenInterface__factory.connect(USDC, deployer);
    const wEth = TokenInterface__factory.connect(WETH, deployer);

    const MockToken = await ethers.getContractFactory("MockToken");
    const mockToken = await MockToken.deploy();
    await mockToken.mint(deployer.address, ethers.utils.parseEther("10000"));

    return {
      layerBankAdapter: LayerBankSupplyLinea__factory.connect(
        layerBankAdapter.address,
        deployer
      ),
      batchTransaction: BatchTransaction__factory.connect(
        batchTransaction.address,
        deployer
      ),
      lEth,
      lUsdc,
      usdc,
      wEth,
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

  const toBytes32 = (bn: BigNumber) => {
    return ethers.utils.hexlify(ethers.utils.zeroPad(bn.toHexString(), 32));
  };

  // This works for token when it has balance mapping at slot 0.
  const setUserTokenBalance = async (
    contract: Contract,
    user: Wallet,
    balance: BigNumber
  ) => {
    const index = ethers.utils.solidityKeccak256(
      ["uint256", "uint256"],
      [user.address, 0] // key, slot
    );

    await hardhat.network.provider.request({
      method: "hardhat_setStorageAt",
      params: [contract.address, index, toBytes32(balance).toString()],
    });

    await hardhat.network.provider.request({
      method: "evm_mine",
      params: [],
    });
  };

  it("Can supply native tokens cross-chain on LayerBank", async () => {
    const { layerBankAdapter, lEth } = await setupTests();

    const amount = ethers.utils.parseEther("1");

    const data = defaultAbiCoder.encode(
      ["address", "address", "uint256"],
      [NATIVE_TOKEN, deployer.address, amount]
    );

    const userBalBefore = await lEth.balanceOf(deployer.address);
    await layerBankAdapter.execute(data, {
      gasLimit: 10000000,
      value: amount,
    });

    const userBalAfter = await lEth.balanceOf(deployer.address);

    expect(userBalBefore).eq(0);
    expect(userBalAfter).gt(0);
  });

  it("Can supply non-native tokens cross-chain on LayerBank", async () => {
    const { layerBankAdapter, lUsdc, usdc } = await setupTests();

    const amount = "2000000";

    const txn = await getTransaction({
      fromTokenAddress: NATIVE_TOKEN,
      toTokenAddress: USDC,
      amount: ethers.utils.parseEther("1").toString(),
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

    await usdc.approve(layerBankAdapter.address, amount);

    const data = defaultAbiCoder.encode(
      ["address", "address", "uint256"],
      [USDC, deployer.address, amount]
    );

    const userBalBefore = await lUsdc.balanceOf(deployer.address);
    await layerBankAdapter.execute(data);

    const userBalAfter = await lUsdc.balanceOf(deployer.address);

    expect(userBalBefore).eq(0);
    expect(userBalAfter).gt(0);
  });

  it("Can supply native tokens cross-chain on LayerBank using BatchTransaction flow", async () => {
    const { layerBankAdapter, mockAssetForwarder, lEth, batchTransaction } =
      await setupTests();

    const amount = ethers.utils.parseEther("1");

    const layerBankSupplyData = defaultAbiCoder.encode(
      ["address", "address", "uint256"],
      [NATIVE_TOKEN, deployer.address, amount]
    );

    const targets = [layerBankAdapter.address];
    const data = [layerBankSupplyData];
    const value = [0];
    const callType = [2];

    const assetForwarderData = defaultAbiCoder.encode(
      ["uint256", "address", "address[]", "uint256[]", "uint256[]", "bytes[]"],
      [0, deployer.address, targets, value, callType, data]
    );

    const userBalBefore = await lEth.balanceOf(deployer.address);
    await mockAssetForwarder.handleMessage(
      NATIVE_TOKEN,
      amount,
      assetForwarderData,
      batchTransaction.address,
      { value: amount, gasLimit: 10000000 }
    );
    const userBalAfter = await lEth.balanceOf(deployer.address);

    expect(userBalBefore).eq(0);
    expect(userBalAfter).gt(0);
  });

  it("Can supply non-native tokens on LayerBank using BatchTransaction flow", async () => {
    const { layerBankAdapter, lUsdc, usdc, batchTransaction } =
      await setupTests();

    const amount = "2000000";

    const txn = await getTransaction({
      fromTokenAddress: NATIVE_TOKEN,
      toTokenAddress: USDC,
      amount: ethers.utils.parseEther("1").toString(),
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

    await usdc.approve(batchTransaction.address, amount);

    const layerBankSupplyData = defaultAbiCoder.encode(
      ["address", "address", "uint256"],
      [USDC, deployer.address, amount]
    );

    const tokens = [USDC];
    const amounts = [amount];
    const targets = [layerBankAdapter.address];
    const data = [layerBankSupplyData];
    const value = [0];
    const callType = [2];

    const userBalBefore = await lUsdc.balanceOf(deployer.address);
    await batchTransaction.executeBatchCallsSameChain(
      0,
      tokens,
      amounts,
      targets,
      value,
      callType,
      data,
      {
        gasLimit: 10000000,
      }
    );

    const userBalAfter = await lUsdc.balanceOf(deployer.address);

    expect(userBalBefore).eq(0);
    expect(userBalAfter).gt(0);
  });
});
