import hardhat, { ethers, waffle } from "hardhat";
import { expect } from "chai";
import { defaultAbiCoder } from "ethers/lib/utils";
import { RPC } from "../constants";
import { DEXSPAN, DEFAULT_ENV, FEE_WALLET } from "../../tasks/constants";
import { RingMint__factory } from "../../typechain/factories/RingMint__factory";
import { TokenInterface__factory } from "../../typechain/factories/TokenInterface__factory";
import { MockAssetForwarder__factory } from "../../typechain/factories/MockAssetForwarder__factory";
import { BatchTransaction__factory } from "../../typechain/factories/BatchTransaction__factory";
import { IWETH__factory } from "../../typechain/factories/IWETH__factory";
import { IRingSwapRouter__factory } from "../../typechain/factories/IRingSwapRouter__factory";
import { BigNumber, Contract, Wallet } from "ethers";
import { getTransaction } from "../utils";
import { zeroAddress } from "ethereumjs-util";
import { MaxUint256 } from "@ethersproject/constants";

const CHAIN_ID = "81457";
const USDB = "0x4300000000000000000000000000000000000003";
const NATIVE_TOKEN = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const WNATIVE = "0x4300000000000000000000000000000000000004";
const USDB_WETH_POOL = "0x9be8a40c9cf00fe33fd84eaedaa5c4fe3f04cbc3";
const RING_SWAP_ROUTER = "0x7001F706ACB6440d17cBFaD63Fa50a22D51696fF"

describe("RingMint Adapter: ", async () => {
  const [deployer, alice] = waffle.provider.getWallets();

  const setupTests = async () => {
    let env = process.env.ENV;
    if (!env) env = DEFAULT_ENV;
    const MockAssetForwarder = await ethers.getContractFactory(
      "MockAssetForwarder"
    );
    const mockAssetForwarder = await MockAssetForwarder.deploy();

    const FeeAdapter = await ethers.getContractFactory("FeeAdapter");
    const feeAdapter = await FeeAdapter.deploy(
      NATIVE_TOKEN,
      WNATIVE,
      FEE_WALLET,
      5
    );

    const BatchTransaction = await ethers.getContractFactory(
      "BatchTransaction"
    );

    const batchTransaction = await BatchTransaction.deploy(
      NATIVE_TOKEN,
      WNATIVE,
      mockAssetForwarder.address,
      DEXSPAN[env][CHAIN_ID],
      zeroAddress(),
      feeAdapter.address
    );

    const RingMintAdapter = await ethers.getContractFactory(
      "RingMint"
    );
    const ringMintAdapter =
      await RingMintAdapter.deploy(
        NATIVE_TOKEN,
        WNATIVE,
        RING_SWAP_ROUTER
      );

    await batchTransaction.setAdapterWhitelist(
      [ringMintAdapter.address, feeAdapter.address],
      [true, true]
    );

    const MockToken = await ethers.getContractFactory("MockToken");
    const mockToken = await MockToken.deploy();
    await mockToken.mint(deployer.address, ethers.utils.parseEther("10000"));

    const FeeDataStoreAddress = await feeAdapter.feeDataStore();

    const FeeDataStoreContract = await ethers.getContractFactory(
      "FeeDataStore"
    );
    const feeDataStoreInstance =
      FeeDataStoreContract.attach(FeeDataStoreAddress);

    await feeDataStoreInstance.updateFeeWalletForAppId(
      [1],
      ["0xBec33ce33afdAF5604CCDF2c4b575238C5FBD23d"]
    );

    const usdb_weth_pool = TokenInterface__factory.connect(
      USDB_WETH_POOL,
      deployer
    );

    return {
      batchTransaction: BatchTransaction__factory.connect(
        batchTransaction.address,
        deployer
      ),
      ringMintAdapter: RingMint__factory.connect(
        ringMintAdapter.address,
        deployer
      ),
      mockToken: TokenInterface__factory.connect(mockToken.address, deployer),
      mockAssetForwarder: MockAssetForwarder__factory.connect(
        mockAssetForwarder.address,
        deployer
      ),
      usdb: TokenInterface__factory.connect(USDB, deployer),
      wnative: IWETH__factory.connect(WNATIVE, deployer),
      router: IRingSwapRouter__factory.connect(
        RING_SWAP_ROUTER,
        deployer
      ),
      usdb_weth_pool,
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

  it("Can mint a new position on Ring weth/usdb", async () => {
    const {
      batchTransaction,
      ringMintAdapter,
      usdb,
      wnative,
      usdb_weth_pool,
    } = await setupTests();

    await wnative.deposit({ value: ethers.utils.parseEther("0.1") });
    // await setUserTokenBalance(usdb, deployer, ethers.utils.parseEther("1"));

    const txn = await getTransaction({
      fromTokenAddress: NATIVE_TOKEN,
      toTokenAddress: USDB,
      amount: ethers.utils.parseEther("0.1").toString(),
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

    const usdbBalance = await usdb.balanceOf(deployer.address);
    expect(usdbBalance).gt(0);

    // const wethBal = await wnative.balanceOf(USDB_WETH_POOL);
    // const wethBalNum = Number(wethBal.toString());
    // const usdbBal = await usdb.balanceOf(USDB_WETH_POOL);
    // const usdbBalNum = Number(usdbBal.toString());
    // const wethDecimals = 10 ** 18;
    // const usdbDecimals = 10 ** 18;

    // const multipliier =
    //   (usdbBalNum * wethDecimals) / (usdbDecimals * wethBalNum);

    const user = deployer;
    const tokenA = wnative.address;
    const tokenB = usdb.address;
    const amountADesired = ethers.utils.parseEther("0.1").toString();
    const amountBDesired = usdbBalance.toString();
    const amountAMin = "0"
    const amountBMin = "0";
    const deadline = 1726632604269;

    const unit256Max = ethers.BigNumber.from(
      "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"
    );

    const mintParams = {
      tokenA,
      tokenB,
      amountADesired: unit256Max,
      amountBDesired: unit256Max,
      amountAMin,
      amountBMin,
      to: user.address,
      deadline,
    };

    const mintParamsIface =
      "tuple(address tokenA, address tokenB, uint256 amountADesired, uint256 amountBDesired, uint256 amountAMin, uint256 amountBMin, address to, uint256 deadline) RingSupplyData";

    const ringData = defaultAbiCoder.encode(
      [mintParamsIface],
      [mintParams]
    );

    const tokens = [mintParams.tokenA, mintParams.tokenB];
    const amounts = [amountADesired, amountBDesired];

    if (mintParams.tokenA === wnative.address) {
      await wnative.approve(
        batchTransaction.address,
        mintParams.amountADesired
      );
      await usdb.approve(batchTransaction.address, mintParams.amountBDesired);
    } else {
      await usdb.approve(batchTransaction.address, mintParams.amountADesired);
      await wnative.approve(
        batchTransaction.address,
        mintParams.amountBDesired
      );
    }

    const appId = ["1"];
    const fee = ["0"];

    const feeData = defaultAbiCoder.encode(
      ["uint256[]", "uint96[]", "address[]", "uint256[]", "bool"],
      [appId, fee, tokens, amounts, true]
    );

    const lpBalBefore = await usdb_weth_pool.balanceOf(deployer.address);

    await batchTransaction.executeBatchCallsSameChain(
      0,
      tokens,
      amounts,
      feeData,
      [ringMintAdapter.address],
      [0],
      [2],
      [ringData],
      { gasLimit: 10000000 }
    );

    const lpBalAfter = await usdb_weth_pool.balanceOf(deployer.address);

    expect(lpBalAfter).gt(lpBalBefore);
  });
});
