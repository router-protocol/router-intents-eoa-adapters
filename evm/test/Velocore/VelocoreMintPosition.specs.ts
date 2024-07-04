import hardhat, { ethers, waffle } from "hardhat";
import { expect } from "chai";
import { defaultAbiCoder } from "ethers/lib/utils";
import { RPC } from "../constants";
import { DEXSPAN, DEFAULT_ENV } from "../../tasks/constants";
import { VelocoreMint__factory } from "../../typechain/factories/VelocoreMint__factory";
import { TokenInterface__factory } from "../../typechain/factories/TokenInterface__factory";
import { MockAssetForwarder__factory } from "../../typechain/factories/MockAssetForwarder__factory";
import { BatchTransaction__factory } from "../../typechain/factories/BatchTransaction__factory";
import { IWETH__factory } from "../../typechain/factories/IWETH__factory";
import { IVelocoreVault__factory } from "../../typechain/factories/IVelocoreVault__factory";
import { BigNumber, Contract, Wallet } from "ethers";
import { getTransaction } from "../utils";
import {
  VELOCORE_TOKEN,
  VELOCORE_VAULT,
} from "../../tasks/deploy/velocore/constants";
import { zeroAddress } from "ethereumjs-util";

const CHAIN_ID = "59144";
const USDC = "0x176211869cA2b568f2A7D4EE941E073a821EE1ff";
const NATIVE_TOKEN = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const WNATIVE = "0xe5d7c2a44ffddf6b295a15c148167daaaf5cf34f";
const USDC_ETH_LP_TOKEN = "0xe2c67A9B15e9E7FF8A9Cb0dFb8feE5609923E5DB";

describe("VelocoreMint Adapter: ", async () => {
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
      WNATIVE,
      mockAssetForwarder.address,
      DEXSPAN[env][CHAIN_ID],
      zeroAddress()
    );

    const VelocoreMintPositionAdapter = await ethers.getContractFactory(
      "VelocoreMint"
    );
    const velocoreMintPositionAdapter =
      await VelocoreMintPositionAdapter.deploy(
        NATIVE_TOKEN,
        WNATIVE,
        VELOCORE_TOKEN[CHAIN_ID],
        VELOCORE_VAULT[CHAIN_ID]
      );

    await batchTransaction.setAdapterWhitelist(
      [velocoreMintPositionAdapter.address],
      [true]
    );

    const MockToken = await ethers.getContractFactory("MockToken");
    const mockToken = await MockToken.deploy();
    await mockToken.mint(deployer.address, ethers.utils.parseEther("10000"));

    const usdc_eth_lp_token = TokenInterface__factory.connect(
      USDC_ETH_LP_TOKEN,
      deployer
    );

    return {
      batchTransaction: BatchTransaction__factory.connect(
        batchTransaction.address,
        deployer
      ),
      velocoreMintPositionAdapter: VelocoreMint__factory.connect(
        velocoreMintPositionAdapter.address,
        deployer
      ),
      mockToken: TokenInterface__factory.connect(mockToken.address, deployer),
      mockAssetForwarder: MockAssetForwarder__factory.connect(
        mockAssetForwarder.address,
        deployer
      ),
      usdc: TokenInterface__factory.connect(USDC, deployer),
      wnative: IWETH__factory.connect(WNATIVE, deployer),
      vault: IVelocoreVault__factory.connect(
        VELOCORE_VAULT[CHAIN_ID],
        deployer
      ),
      usdc_eth_lp_token,
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

  it.only("Can mint a new position on Velocore weth/usdc", async () => {
    const {
      batchTransaction,
      velocoreMintPositionAdapter,
      vault,
      usdc,
      wnative,
      usdc_eth_lp_token,
    } = await setupTests();

    // await wnative.deposit({ value: ethers.utils.parseEther("0.1") });
    // await setUserTokenBalance(usdc, deployer, ethers.utils.parseEther("1"));

    const txn = await getTransaction({
      fromTokenAddress: NATIVE_TOKEN,
      toTokenAddress: USDC,
      amount: ethers.utils.parseEther("0.2").toString(),
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

    const usdcBal = await usdc.balanceOf(deployer.address);

    expect(usdcBal).gt(0);

    const user = deployer;
    const tokenA = NATIVE_TOKEN;
    const tokenB = usdc.address;
    const amountADesired = ethers.utils.parseEther("0.1").toString();
    const amountBDesired = usdcBal.div(2).toString(); //(amountA) * multipliier * decimals;

    const mintParams = {
      tokenA,
      tokenB,
      lpToken: usdc_eth_lp_token.address,
      to: user.address,
      amountADesired,
      amountBDesired,
    };

    const mintParamsIface =
      "tuple(address tokenA, address tokenB, address lpToken, address to, uint256 amountADesired, uint256 amountBDesired) VelocoreSupplyData";

    const velocoreData = defaultAbiCoder.encode(
      [mintParamsIface],
      [mintParams]
    );

    const tokens = [mintParams.tokenA, mintParams.tokenB];
    const amounts = [mintParams.amountADesired, mintParams.amountBDesired];
    const feeInfo = [
      { fee: 0, recipient: zeroAddress() },
      { fee: 0, recipient: zeroAddress() },
    ];

    let value = "0";

    if (mintParams.tokenA === NATIVE_TOKEN) {
      await usdc.approve(batchTransaction.address, mintParams.amountBDesired);
      value = mintParams.amountADesired;
    } else {
      await usdc.approve(batchTransaction.address, mintParams.amountADesired);
      value = mintParams.amountBDesired;
    }

    const lpBalBefore = await usdc_eth_lp_token.balanceOf(deployer.address);

    await batchTransaction.executeBatchCallsSameChain(
      0,
      tokens,
      amounts,
      feeInfo,
      [velocoreMintPositionAdapter.address],
      [0],
      [2],
      [velocoreData],
      { value }
    );

    const lpBalAfter = await usdc_eth_lp_token.balanceOf(deployer.address);

    expect(lpBalAfter).gt(lpBalBefore);
  });
});
