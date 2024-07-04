/* eslint-disable no-unused-vars */
import hardhat, { ethers, waffle } from "hardhat";
import { expect } from "chai";
import { RPC } from "../constants";
import { DEXSPAN, DEFAULT_ENV } from "../../tasks/constants";
import { SonneSupply__factory } from "../../typechain/factories/SonneSupply__factory";
import { TokenInterface__factory } from "../../typechain/factories/TokenInterface__factory";
import { MockAssetForwarder__factory } from "../../typechain/factories/MockAssetForwarder__factory";
import { BatchTransaction__factory } from "../../typechain/factories/BatchTransaction__factory";
import { BigNumber, Contract, Wallet } from "ethers";
import { defaultAbiCoder } from "ethers/lib/utils";
import { zeroAddress } from "ethereumjs-util";

const CHAIN_ID = "10";
const NATIVE_TOKEN = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const WETH = "0x4200000000000000000000000000000000000006";
const SO_USDT = "0x5Ff29E4470799b982408130EFAaBdeeAE7f66a10";
const USDT = "0x94b008aa00579c1307b0ef2c499ad98a8ce58e58";

// const QI_ERC20_TOKEN_ABI = [
//   "function transfer(address dst, uint amount) external returns (bool)",
//   "function transferFrom(address src, address dst, uint256 amount) external returns (bool)",
//   "function approve(address spender, uint256 amount) external returns (bool)",
//   "function allowance(address owner, address spender) external view returns (uint)",
//   "function balanceOf(address owner) external view returns (uint)",
//   "function balanceOfUnderlying(address owner) external returns (uint)",
//   "event Approval(address indexed owner, address indexed spender, uint amount)",
// ];

describe("Sonne Supply Adapter: ", async () => {
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
      DEXSPAN[env][CHAIN_ID],
      zeroAddress()
    );

    const SonneAdapter = await ethers.getContractFactory("SonneSupply");

    const sonneAdapterUSDT = await SonneAdapter.deploy(
      NATIVE_TOKEN,
      WETH,
      SO_USDT
    );

    await batchTransaction.setAdapterWhitelist(
      [sonneAdapterUSDT.address],
      [true]
    );

    const soUsdt = TokenInterface__factory.connect(SO_USDT, deployer);
    const usdt = TokenInterface__factory.connect(USDT, deployer);

    const MockToken = await ethers.getContractFactory("MockToken");
    const mockToken = await MockToken.deploy();
    await mockToken.mint(deployer.address, ethers.utils.parseEther("10000"));

    return {
      sonneAdapterUSDT: SonneSupply__factory.connect(
        sonneAdapterUSDT.address,
        deployer
      ),
      batchTransaction: BatchTransaction__factory.connect(
        batchTransaction.address,
        deployer
      ),
      soUsdt,
      usdt,
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

  it("Can supply non-native tokens cross-chain on Sonne", async () => {
    const { sonneAdapterUSDT, soUsdt, usdt } = await setupTests();

    const amount = ethers.utils.parseEther("1");

    await setUserTokenBalance(usdt, deployer, amount);
    await usdt.approve(sonneAdapterUSDT.address, amount);
    expect(await usdt.balanceOf(deployer.address)).eq(amount);

    const data = defaultAbiCoder.encode(
      ["address", "address", "uint256"],
      [USDT, deployer.address, amount]
    );

    const userBalBefore = await soUsdt.balanceOf(deployer.address);
    await sonneAdapterUSDT.execute(data, {
      gasLimit: 10000000,
    });

    const userBalAfter = await soUsdt.balanceOf(deployer.address);

    expect(userBalBefore).eq(0);
    expect(userBalAfter).gt(0);
  });

  it("Cannot supply native tokens & get refund cross-chain on Sonne using BatchTransaction flow", async () => {
    const { sonneAdapterUSDT, mockAssetForwarder, soUsdt, batchTransaction } =
      await setupTests();

    const amount = ethers.utils.parseEther("1");

    const sonneSupplyData = defaultAbiCoder.encode(
      ["address", "address", "uint256"],
      [NATIVE_TOKEN, deployer.address, amount]
    );

    const targets = [sonneAdapterUSDT.address];
    const data = [sonneSupplyData];
    const value = [0];
    const callType = [2];

    const assetForwarderData = defaultAbiCoder.encode(
      ["uint256", "address", "address[]", "uint256[]", "uint256[]", "bytes[]"],
      [0, deployer.address, targets, value, callType, data]
    );

    const userBalBefore = await soUsdt.balanceOf(deployer.address);
    expect(
      await mockAssetForwarder.handleMessage(
        NATIVE_TOKEN,
        amount,
        assetForwarderData,
        batchTransaction.address,
        { value: amount, gasLimit: 10000000 }
      )
    ).to.emit("OperationFailedRefundEvent");
    const userBalAfter = await soUsdt.balanceOf(deployer.address);

    expect(userBalBefore).eq(userBalAfter);
  });

  it("Can supply non-native tokens on Sonne using BatchTransaction flow", async () => {
    const { sonneAdapterUSDT, soUsdt, usdt, batchTransaction } =
      await setupTests();

    const amount = ethers.utils.parseEther("1");

    await setUserTokenBalance(usdt, deployer, amount);
    await usdt.approve(sonneAdapterUSDT.address, amount);
    expect(await usdt.balanceOf(deployer.address)).eq(amount);

    await usdt.approve(batchTransaction.address, amount);

    const sonneSupplyData = defaultAbiCoder.encode(
      ["address", "address", "uint256"],
      [USDT, deployer.address, amount]
    );

    const tokens = [USDT];
    const amounts = [amount];
    const targets = [sonneAdapterUSDT.address];
    const data = [sonneSupplyData];
    const value = [0];
    const callType = [2];
    const feeInfo = [{ fee: 0, recipient: zeroAddress() }];

    const userBalBefore = await soUsdt.balanceOf(deployer.address);
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

    const userBalAfter = await soUsdt.balanceOf(deployer.address);

    expect(userBalBefore).eq(0);
    expect(userBalAfter).gt(0);
  });
});
