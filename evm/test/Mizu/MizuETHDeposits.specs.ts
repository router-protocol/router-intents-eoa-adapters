import hardhat, { ethers, waffle } from "hardhat";
import { expect } from "chai";
import {
  DEXSPAN,
  DEFAULT_ENV,
  NATIVE,
  WNATIVE,
  FEE_WALLET,
} from "../../tasks/constants";
import { MizuETHDeposits__factory } from "../../typechain/factories/MizuETHDeposits__factory";
import { TokenInterface__factory } from "../../typechain/factories/TokenInterface__factory";
import { MockAssetForwarder__factory } from "../../typechain/factories/MockAssetForwarder__factory";
import { BatchTransaction__factory } from "../../typechain/factories/BatchTransaction__factory";
import { defaultAbiCoder } from "ethers/lib/utils";
import { DexSpanAdapter__factory } from "../../typechain/factories/DexSpanAdapter__factory";
import { zeroAddress } from "ethereumjs-util";
import { BigNumber, Contract, Wallet } from "ethers";
import {
  wstETH,
  swETH,
  STONE,
  rswETH,
  weETH,
  ezETH,
  WETH,
} from "../../tasks/deploy/mizu/constants";

const CHAIN_ID = "1";
const HYPER_ETH_TOKEN = "0x9E3C0D2D70e9A4BF4f9d5F0A6E4930ce76Fed09e";
const ETH_DEPOSITS_VAULT = "0x47a871268CdC8846fa36afa5dE09302066349BaE";
const NATIVE_TOKEN = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const WETH_TOKEN = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";

describe("MizuETHDeposits Adapter: ", async () => {
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

    const MizuETHDeposits = await ethers.getContractFactory("MizuETHDeposits");

    const initialStablecoins = [
      WETH,
      ezETH,
      wstETH,
      swETH,
      STONE,
      rswETH,
      weETH,
    ];

    const mizuETHDepositsAdapter = await MizuETHDeposits.deploy(
      NATIVE,
      WNATIVE[env][CHAIN_ID],
      HYPER_ETH_TOKEN,
      ETH_DEPOSITS_VAULT,
      initialStablecoins
    );

    await batchTransaction.setAdapterWhitelist(
      [
        dexSpanAdapter.address,
        mizuETHDepositsAdapter.address,
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
      mizuETHDepositsAdapter: MizuETHDeposits__factory.connect(
        mizuETHDepositsAdapter.address,
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
      hyperETH: TokenInterface__factory.connect(HYPER_ETH_TOKEN, deployer),
      weth: TokenInterface__factory.connect(WETH_TOKEN, deployer),
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
      [user.address, 3] // key, slot
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

  it("Can deposits on Mizu WETH for hyperETH on same chain", async () => {
    const { batchTransaction, mizuETHDepositsAdapter, hyperETH, weth } =
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
    await setUserTokenBalance(weth, deployer, ethers.utils.parseEther("0.2"));
    const wethBalBefore = await weth.balanceOf(deployer.address);
    expect(wethBalBefore).gt(0);

    const unit256Max = ethers.BigNumber.from(
      "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"
    );

    const MizuStablesDepositData = defaultAbiCoder.encode(
      ["address", "address", "uint256", "uint256"],
      [weth.address, deployer.address, unit256Max, 0]
    );

    const tokens = [WETH];
    const amounts = [100000000];
    const targets = [mizuETHDepositsAdapter.address];
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
    const hyperETHBalBefore = await hyperETH.balanceOf(deployer.address);

    await weth.approve(batchTransaction.address, ethers.constants.MaxUint256);

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
    const hyperETHBalAfter = await hyperETH.balanceOf(deployer.address);

    expect(balBefore).gt(balAfter);
    expect(hyperETHBalAfter).gt(hyperETHBalBefore);
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
