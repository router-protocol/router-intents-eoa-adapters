import hardhat, { ethers, waffle } from "hardhat";
import { expect } from "chai";
import {
  DEXSPAN,
  DEFAULT_ENV,
  NATIVE,
  WNATIVE,
  FEE_WALLET,
} from "../../tasks/constants";
import { MizuStablesDeposits__factory } from "../../typechain/factories/MizuStablesDeposits__factory";
import { TokenInterface__factory } from "../../typechain/factories/TokenInterface__factory";
import { MockAssetForwarder__factory } from "../../typechain/factories/MockAssetForwarder__factory";
import { BatchTransaction__factory } from "../../typechain/factories/BatchTransaction__factory";
import { defaultAbiCoder } from "ethers/lib/utils";
import { DexSpanAdapter__factory } from "../../typechain/factories/DexSpanAdapter__factory";
import { zeroAddress } from "ethereumjs-util";
import { BigNumber, Contract, Wallet } from "ethers";
// import { getTransaction } from "../utils";
// import { MaxUint256 } from "@ethersproject/constants";

const CHAIN_ID = "1";
const HYPER_USD = "0x340116F605Ca4264B8bC75aAE1b3C8E42AE3a3AB";
const STABLES_DEPOSITS_VAULT = "0xbC08eF3368615Be8495EB394a0b7d8d5FC6d1A55";
const NATIVE_TOKEN = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const USDT = "0xdAC17F958D2ee523a2206206994597C13D831ec7";
const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";

describe("MizuStablesDeposits Adapter: ", async () => {
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

    const FeeAdapter = await ethers.getContractFactory("FeeAdapter");
    const feeAdapter = await FeeAdapter.deploy(
      NATIVE_TOKEN,
      WNATIVE[env][CHAIN_ID],
      FEE_WALLET,
      5
    );

    const batchTransaction = await BatchTransaction.deploy(
      NATIVE,
      WNATIVE[env][CHAIN_ID],
      mockAssetForwarder.address,
      DEXSPAN[env][CHAIN_ID],
      zeroAddress(),
      feeAdapter.address
    );

    const DexSpanAdapter = await ethers.getContractFactory("DexSpanAdapter");
    const dexSpanAdapter = await DexSpanAdapter.deploy(
      NATIVE,
      WNATIVE[env][CHAIN_ID],
      DEXSPAN[env][CHAIN_ID]
    );

    const MizuStablesDeposits = await ethers.getContractFactory(
      "MizuStablesDeposits"
    );

    const initialStablecoins = [USDT];

    const mizuStablesDepositsAdapter = await MizuStablesDeposits.deploy(
      NATIVE,
      WNATIVE[env][CHAIN_ID],
      HYPER_USD,
      STABLES_DEPOSITS_VAULT,
      initialStablecoins
    );

    await batchTransaction.setAdapterWhitelist(
      [
        dexSpanAdapter.address,
        mizuStablesDepositsAdapter.address,
        feeAdapter.address,
      ],
      [true, true, true]
    );

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

    return {
      batchTransaction: BatchTransaction__factory.connect(
        batchTransaction.address,
        deployer
      ),
      mizuStablesDepositsAdapter: MizuStablesDeposits__factory.connect(
        mizuStablesDepositsAdapter.address,
        deployer
      ),
      dexSpanAdapter: DexSpanAdapter__factory.connect(
        dexSpanAdapter.address,
        deployer
      ),
      mockAssetForwarder: MockAssetForwarder__factory.connect(
        mockAssetForwarder.address,
        deployer
      ),
      usdt: TokenInterface__factory.connect(USDT, deployer),
      usdc: TokenInterface__factory.connect(USDC, deployer),
      hyperUSD: TokenInterface__factory.connect(HYPER_USD, deployer),
    };
  };

  beforeEach(async function () {
    await hardhat.network.provider.request({
      method: "hardhat_reset",
      params: [
        {
          forking: {
            jsonRpcUrl: "https://rpc.ankr.com/eth",
            blockNumber: 21881240,
          },
        },
      ],
    });
  });

  //   it("Can stake on StakeStone for BeraStone on same chain", async () => {
  //     const { batchTransaction, mizuStablesDepositsAdapter, hyperUSD } =
  //       await setupTests();

  //     const amount = ethers.utils.parseEther("1");

  //     const MizuStablesDepositData = defaultAbiCoder.encode(
  //       ["address", "address", "uint256"],
  //       [NATIVE, deployer.address, MaxUint256]
  //     );

  //     const tokens = [NATIVE_TOKEN];
  //     const amounts = [amount];
  //     const targets = [mizuStablesDepositsAdapter.address];
  //     const data = [MizuStablesDepositData];
  //     const value = [0];
  //     const callType = [2];
  //     // const feeInfo = [{ fee: 0, recipient: zeroAddress() }];

  //     const fee = ["0"];
  //     const feeData = defaultAbiCoder.encode(
  //       ["uint256[]", "uint96[]", "address[]", "uint256[]", "bool"],
  //       [["1"], fee, tokens, amounts, true]
  //     );

  //     const balBefore = await ethers.provider.getBalance(deployer.address);
  //     const hyperUSDBalBefore = await hyperUSD.balanceOf(deployer.address);

  //     await batchTransaction.executeBatchCallsSameChain(
  //       0,
  //       tokens,
  //       amounts,
  //       feeData,
  //       targets,
  //       value,
  //       callType,
  //       data,
  //       { value: amount, gasLimit: 10000000 }
  //     );

  //     const balAfter = await ethers.provider.getBalance(deployer.address);
  //     const hyperUSDBalAfter = await hyperUSD.balanceOf(deployer.address);

  //     expect(balBefore).gt(balAfter);
  //     expect(hyperUSDBalAfter).gt(hyperUSDBalBefore);
  //   });

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
      [user.address, 2] // key, slot
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

  it("Can deposits on Mizu USDC for hyperUSD on same chain", async () => {
    const { batchTransaction, mizuStablesDepositsAdapter, hyperUSD, usdt } =
      await setupTests();
    // const usdcBalBefore = await usdt.balanceOf(deployer.address);
    // const amount = ethers.utils.parseEther("0.2");

    // const txn = await getTransaction({
    //   fromTokenAddress: NATIVE_TOKEN,
    //   toTokenAddress: USDT,
    //   amount: ethers.utils.parseEther("1").toString(),
    //   fromTokenChainId: CHAIN_ID,
    //   toTokenChainId: CHAIN_ID,
    //   senderAddress: deployer.address,
    //   receiverAddress: deployer.address,
    // });

    // await deployer.sendTransaction({
    //   to: txn.to,
    //   value: txn.value,
    //   data: txn.data,
    // });
    // console.log(res);
    // const res2 = await res.wait();
    // console.log(res2);
    await setUserTokenBalance(usdt, deployer, ethers.utils.parseEther("0.2"));
    const usdcBalBefore = await usdt.balanceOf(deployer.address);
    expect(usdcBalBefore).gt(0);

    const unit256Max = ethers.BigNumber.from(
      "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"
    );

    const MizuStablesDepositData = defaultAbiCoder.encode(
      ["address", "address", "uint256", "uint256"],
      [usdt.address, deployer.address, unit256Max, 0]
    );

    const tokens = [USDT];
    const amounts = [100000000];
    const targets = [mizuStablesDepositsAdapter.address];
    const data = [MizuStablesDepositData];
    const value = [0];
    const callType = [2];
    // const feeInfo = [{ fee: 0, recipient: zeroAddress() }];

    const fee = ["0"];
    const feeData = defaultAbiCoder.encode(
      ["uint256[]", "uint96[]", "address[]", "uint256[]", "bool"],
      [["1"], fee, tokens, amounts, true]
    );

    const balBefore = await ethers.provider.getBalance(deployer.address);
    const hyperUSDBalBefore = await hyperUSD.balanceOf(deployer.address);

    await usdt.approve(batchTransaction.address, ethers.constants.MaxUint256);

    await batchTransaction.executeBatchCallsSameChain(
      0,
      tokens,
      amounts,
      feeData,
      targets,
      value,
      callType,
      data,
      { gasLimit: 10000000 }
    );

    const balAfter = await ethers.provider.getBalance(deployer.address);
    const hyperUSDBalAfter = await hyperUSD.balanceOf(deployer.address);

    expect(balBefore).gt(balAfter);
    expect(hyperUSDBalAfter).gt(hyperUSDBalBefore);
  });

  //   it("Can stake ETH on Stader on dest chain when instruction is received from BatchTransaction contract", async () => {
  //     const {
  //       batchTransaction,
  //       mizuStablesDepositsAdapter,
  //       hyperUSD,
  //       mockAssetForwarder,
  //     } = await setupTests();

  //     const amount = "100000000000000000";

  //     const targets = [mizuStablesDepositsAdapter.address];
  //     const data = [
  //       defaultAbiCoder.encode(
  //         ["address", "uint256"],
  //         [deployer.address, amount]
  //       ),
  //     ];
  //     const value = [0];
  //     const callType = [2];

  //     const assetForwarderData = defaultAbiCoder.encode(
  //       ["uint256", "address", "address[]", "uint256[]", "uint256[]", "bytes[]"],
  //       [0, deployer.address, targets, value, callType, data]
  //     );

  //     const balBefore = await ethers.provider.getBalance(deployer.address);
  //     const hyperUSDBalBefore = await hyperUSD.balanceOf(deployer.address);

  //     await mockAssetForwarder.handleMessage(
  //       NATIVE_TOKEN,
  //       amount,
  //       assetForwarderData,
  //       batchTransaction.address,
  //       { value: amount }
  //     );

  //     const balAfter = await ethers.provider.getBalance(deployer.address);
  //     const hyperUSDBalAfter = await hyperUSD.balanceOf(deployer.address);

  //     expect(balAfter).lt(balBefore);
  //     expect(hyperUSDBalAfter).gt(hyperUSDBalBefore);
  //   });
});
