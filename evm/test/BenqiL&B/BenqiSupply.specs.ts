/* eslint-disable no-unused-vars */
import hardhat, { ethers, waffle } from "hardhat";
import { expect } from "chai";
import { RPC } from "../constants";
import { DEXSPAN, DEFAULT_ENV } from "../../tasks/constants";
import { BenqiSupply__factory } from "../../typechain/factories/BenqiSupply__factory";
import { TokenInterface__factory } from "../../typechain/factories/TokenInterface__factory";
import { MockAssetForwarder__factory } from "../../typechain/factories/MockAssetForwarder__factory";
import { BatchTransaction__factory } from "../../typechain/factories/BatchTransaction__factory";
import { BigNumber, Contract, Wallet } from "ethers";
import { defaultAbiCoder } from "ethers/lib/utils";
import { zeroAddress } from "ethereumjs-util";

const CHAIN_ID = "43114";
const NATIVE_TOKEN = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const QI_AVAX = "0x5C0401e81Bc07Ca70fAD469b451682c0d747Ef1c";
const WAVAX = "0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7";
const QI_USDC = "0xBEb5d47A3f720Ec0a390d04b4d41ED7d9688bC7F";
const USDC = "0xA7D7079b0FEaD91F3e65f86E8915Cb59c1a4C664";

const QI_ERC20_TOKEN_ABI = [
  "function transfer(address dst, uint amount) external returns (bool)",
  "function transferFrom(address src, address dst, uint256 amount) external returns (bool)",
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) external view returns (uint)",
  "function balanceOf(address owner) external view returns (uint)",
  "function balanceOfUnderlying(address owner) external returns (uint)",
  "event Approval(address indexed owner, address indexed spender, uint amount)",
];

describe("Benqi Supply Adapter: ", async () => {
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
      WAVAX,
      mockAssetForwarder.address,
      DEXSPAN[env][CHAIN_ID]
    );

    const BenqiAdapter = await ethers.getContractFactory("BenqiSupply");

    const benqiAdapter = await BenqiAdapter.deploy(
      NATIVE_TOKEN,
      WAVAX,
      QI_AVAX
    );

    const benqiAdapterUSDC = await BenqiAdapter.deploy(
      NATIVE_TOKEN,
      WAVAX,
      QI_USDC
    );

    await batchTransaction.setAdapterWhitelist(
      [benqiAdapter.address, benqiAdapterUSDC.address],
      [true, true]
    );

    const qiAvax = TokenInterface__factory.connect(QI_AVAX, deployer);
    const qiUsdc = TokenInterface__factory.connect(QI_USDC, deployer);
    const usdc = TokenInterface__factory.connect(USDC, deployer);
    const wAvax = TokenInterface__factory.connect(WAVAX, deployer);

    const MockToken = await ethers.getContractFactory("MockToken");
    const mockToken = await MockToken.deploy();
    await mockToken.mint(deployer.address, ethers.utils.parseEther("10000"));

    return {
      benqiAdapter: BenqiSupply__factory.connect(
        benqiAdapter.address,
        deployer
      ),
      benqiAdapterUSDC: BenqiSupply__factory.connect(
        benqiAdapterUSDC.address,
        deployer
      ),
      batchTransaction: BatchTransaction__factory.connect(
        batchTransaction.address,
        deployer
      ),
      qiAvax,
      qiUsdc,
      usdc,
      wAvax,
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

  it("Can supply native tokens cross-chain on Benqi", async () => {
    const { benqiAdapter, qiAvax } = await setupTests();

    const amount = ethers.utils.parseEther("1");

    const data = defaultAbiCoder.encode(
      ["address", "address", "uint256"],
      [NATIVE_TOKEN, deployer.address, amount]
    );

    const userBalBefore = await qiAvax.balanceOf(deployer.address);
    await benqiAdapter.execute(data, {
      gasLimit: 10000000,
      value: amount,
    });

    const userBalAfter = await qiAvax.balanceOf(deployer.address);

    expect(userBalBefore).eq(0);
    expect(userBalAfter).gt(0);
  });

  it("Can supply non-native tokens cross-chain on Benqi", async () => {
    const { benqiAdapterUSDC, qiUsdc, usdc } = await setupTests();

    const amount = ethers.utils.parseEther("1");

    await setUserTokenBalance(usdc, deployer, amount);
    await usdc.approve(benqiAdapterUSDC.address, amount);
    expect(await usdc.balanceOf(deployer.address)).eq(amount);

    const data = defaultAbiCoder.encode(
      ["address", "address", "uint256"],
      [USDC, deployer.address, amount]
    );

    const userBalBefore = await qiUsdc.balanceOf(deployer.address);
    await benqiAdapterUSDC.execute(data, {
      gasLimit: 10000000,
    });

    const userBalAfter = await qiUsdc.balanceOf(deployer.address);

    expect(userBalBefore).eq(0);
    expect(userBalAfter).gt(0);
  });

  it("Can supply native tokens cross-chain on Benqi using BatchTransaction flow", async () => {
    const { benqiAdapter, mockAssetForwarder, qiAvax, batchTransaction } =
      await setupTests();

    const amount = ethers.utils.parseEther("1");

    const benqiSupplyData = defaultAbiCoder.encode(
      ["address", "address", "uint256"],
      [NATIVE_TOKEN, deployer.address, amount]
    );

    const targets = [benqiAdapter.address];
    const data = [benqiSupplyData];
    const value = [0];
    const callType = [2];

    const assetForwarderData = defaultAbiCoder.encode(
      ["uint256", "address", "address[]", "uint256[]", "uint256[]", "bytes[]"],
      [0, deployer.address, targets, value, callType, data]
    );

    const userBalBefore = await qiAvax.balanceOf(deployer.address);
    await mockAssetForwarder.handleMessage(
      NATIVE_TOKEN,
      amount,
      assetForwarderData,
      batchTransaction.address,
      { value: amount, gasLimit: 10000000 }
    );
    const userBalAfter = await qiAvax.balanceOf(deployer.address);

    expect(userBalBefore).eq(0);
    expect(userBalAfter).gt(0);
  });

  it("Can supply non-native tokens on Benqi using BatchTransaction flow", async () => {
    const { benqiAdapterUSDC, qiUsdc, usdc, batchTransaction } =
      await setupTests();

    const amount = ethers.utils.parseEther("1");

    await setUserTokenBalance(usdc, deployer, amount);
    await usdc.approve(benqiAdapterUSDC.address, amount);
    expect(await usdc.balanceOf(deployer.address)).eq(amount);

    await usdc.approve(batchTransaction.address, amount);

    const benqiSupplyData = defaultAbiCoder.encode(
      ["address", "address", "uint256"],
      [USDC, deployer.address, amount]
    );

    const tokens = [USDC];
    const amounts = [amount];
    const targets = [benqiAdapterUSDC.address];
    const data = [benqiSupplyData];
    const value = [0];
    const callType = [2];

    const userBalBefore = await qiUsdc.balanceOf(deployer.address);
    await batchTransaction.executeBatchCallsSameChain(
      0,
      tokens,
      amounts,
      targets,
      value,
      callType,
      data
    );

    const userBalAfter = await qiUsdc.balanceOf(deployer.address);

    expect(userBalBefore).eq(0);
    expect(userBalAfter).gt(0);
  });
});
