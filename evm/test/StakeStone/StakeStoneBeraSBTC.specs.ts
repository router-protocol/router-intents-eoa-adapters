import hardhat, { ethers, waffle } from "hardhat";
import { expect } from "chai";
import {
  DEXSPAN,
  DEFAULT_ENV,
  NATIVE,
  WNATIVE,
  FEE_WALLET,
} from "../../tasks/constants";
import { StakeStoneBeraSBTC__factory } from "../../typechain/factories/StakeStoneBeraSBTC__factory";
import { TokenInterface__factory } from "../../typechain/factories/TokenInterface__factory";
import { MockAssetForwarder__factory } from "../../typechain/factories/MockAssetForwarder__factory";
import { BatchTransaction__factory } from "../../typechain/factories/BatchTransaction__factory";
import { defaultAbiCoder } from "ethers/lib/utils";
import { DexSpanAdapter__factory } from "../../typechain/factories/DexSpanAdapter__factory";
import { zeroAddress } from "ethereumjs-util";
// import { MaxUint256 } from "@ethersproject/constants";
import { getTransaction } from "../utils";
// import { getTransaction } from "../utils";

const CHAIN_ID = "1";
const BERA_SBTC = "0xd7F311a29b54E13b0A6c97027ece4a41cBe9EA38";
const BERA_SBTC_VAULT = "0x437c885357425686b53e0d18c8D9c26A4a6Be43f";
const NATIVE_TOKEN = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const USDT = "0xdAC17F958D2ee523a2206206994597C13D831ec7";
const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const WBTC = "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599";
const CBBTC = "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf";
const SBTC_TOKEN = "0x094c0e36210634c3CfA25DC11B96b562E0b07624";

describe("BeraStakeStoneSBTC Adapter: ", async () => {
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

    const StakeStoneBeraSBTC = await ethers.getContractFactory(
      "StakeStoneBeraSBTC"
    );
    const stakeStoneBeraSBTCAdapter = await StakeStoneBeraSBTC.deploy(
      NATIVE,
      WNATIVE[env][CHAIN_ID],
      BERA_SBTC,
      BERA_SBTC_VAULT
    );

    await batchTransaction.setAdapterWhitelist(
      [
        dexSpanAdapter.address,
        stakeStoneBeraSBTCAdapter.address,
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
      stakeStoneBeraSBTCAdapter: StakeStoneBeraSBTC__factory.connect(
        stakeStoneBeraSBTCAdapter.address,
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
      wbtc: TokenInterface__factory.connect(WBTC, deployer),
      sbtc: TokenInterface__factory.connect(SBTC_TOKEN, deployer),
      cbBtc: TokenInterface__factory.connect(CBBTC, deployer),
      beraSBTC: TokenInterface__factory.connect(BERA_SBTC, deployer),
    };
  };

  beforeEach(async function () {
    await hardhat.network.provider.request({
      method: "hardhat_reset",
      params: [
        {
          forking: {
            jsonRpcUrl: "https://eth.llamarpc.com",
          },
        },
      ],
    });
  });

  it("Can stake on StakeStone CBBTC for BeraSBTC on same chain", async () => {
    const { batchTransaction, stakeStoneBeraSBTCAdapter, beraSBTC, cbBtc } =
      await setupTests();

    // const amount = ethers.utils.parseEther("0.2");

    const txn = await getTransaction({
      fromTokenAddress: NATIVE_TOKEN,
      toTokenAddress: CBBTC,
      amount: ethers.utils.parseEther("200").toString(),
      fromTokenChainId: CHAIN_ID,
      toTokenChainId: CHAIN_ID,
      senderAddress: deployer.address,
      receiverAddress: deployer.address,
    });

    // console.log("txn", txn);

    await deployer.sendTransaction({
      to: txn.to,
      value: txn.value,
      data: txn.data,
    });

    const cbBtcBalBefore = await cbBtc.balanceOf(deployer.address);

    expect(cbBtcBalBefore).gt(0);

    const unit256Max = ethers.BigNumber.from(
      "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"
    );

    const BeraSBTCData = defaultAbiCoder.encode(
      ["address", "address", "uint256"],
      [cbBtc.address, deployer.address, unit256Max]
    );

    const tokens = [CBBTC];
    const amounts = [cbBtcBalBefore];
    const targets = [stakeStoneBeraSBTCAdapter.address];
    const data = [BeraSBTCData];
    const value = [0];
    const callType = [2];
    // const feeInfo = [{ fee: 0, recipient: zeroAddress() }];

    const fee = ["0"];
    const feeData = defaultAbiCoder.encode(
      ["uint256[]", "uint96[]", "address[]", "uint256[]", "bool"],
      [["1"], fee, tokens, amounts, true]
    );

    const balBefore = await ethers.provider.getBalance(deployer.address);
    const beraSBTCBalBefore = await beraSBTC.balanceOf(deployer.address);

    await cbBtc.approve(batchTransaction.address, ethers.constants.MaxUint256);

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
    const beraSBTCBalAfter = await beraSBTC.balanceOf(deployer.address);

    expect(balBefore).gt(balAfter);
    expect(beraSBTCBalAfter).gt(beraSBTCBalBefore);
  });

  //   it("Can stake on StakeStone SBTC for BeraSBTC on same chain", async () => {
  //     const { batchTransaction, stakeStoneBeraSBTCAdapter, beraSBTC, sbtc } =
  //       await setupTests();

  //     // const amount = ethers.utils.parseEther("0.2");

  //     const txn = await getTransaction({
  //       fromTokenAddress: NATIVE_TOKEN,
  //       toTokenAddress: SBTC_TOKEN,
  //       amount: ethers.utils.parseEther("200").toString(),
  //       fromTokenChainId: CHAIN_ID,
  //       toTokenChainId: CHAIN_ID,
  //       senderAddress: deployer.address,
  //       receiverAddress: deployer.address,
  //     });

  //     // console.log("txn", txn);

  //     await deployer.sendTransaction({
  //       to: txn.to,
  //       value: txn.value,
  //       data: txn.data,
  //     });

  //     const sBtcBalBefore = await sbtc.balanceOf(deployer.address);

  //     expect(sBtcBalBefore).gt(0);

  //     const unit256Max = ethers.BigNumber.from(
  //       "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"
  //     );

  //     const BeraSBTCData = defaultAbiCoder.encode(
  //       ["address", "address", "uint256"],
  //       [sbtc.address, deployer.address, unit256Max]
  //     );

  //     const tokens = [SBTC_TOKEN];
  //     const amounts = [sBtcBalBefore];
  //     const targets = [stakeStoneBeraSBTCAdapter.address];
  //     const data = [BeraSBTCData];
  //     const value = [0];
  //     const callType = [2];
  //     // const feeInfo = [{ fee: 0, recipient: zeroAddress() }];

  //     const fee = ["0"];
  //     const feeData = defaultAbiCoder.encode(
  //       ["uint256[]", "uint96[]", "address[]", "uint256[]", "bool"],
  //       [["1"], fee, tokens, amounts, true]
  //     );

  //     const balBefore = await ethers.provider.getBalance(deployer.address);
  //     const beraSBTCBalBefore = await beraSBTC.balanceOf(deployer.address);

  //     await sbtc.approve(batchTransaction.address, ethers.constants.MaxUint256);

  //     await batchTransaction.executeBatchCallsSameChain(
  //       0,
  //       tokens,
  //       amounts,
  //       feeData,
  //       targets,
  //       value,
  //       callType,
  //       data,
  //       { gasLimit: 10000000 }
  //     );

  //     const balAfter = await ethers.provider.getBalance(deployer.address);
  //     const beraSBTCBalAfter = await beraSBTC.balanceOf(deployer.address);

  //     expect(balBefore).gt(balAfter);
  //     expect(beraSBTCBalAfter).gt(beraSBTCBalBefore);
  //   });

  it("Can stake on StakeStone WBTC for BeraSBTC on same chain", async () => {
    const { batchTransaction, stakeStoneBeraSBTCAdapter, beraSBTC, wbtc } =
      await setupTests();

    // const amount = ethers.utils.parseEther("0.2");

    const txn = await getTransaction({
      fromTokenAddress: NATIVE_TOKEN,
      toTokenAddress: WBTC,
      amount: ethers.utils.parseEther("200").toString(),
      fromTokenChainId: CHAIN_ID,
      toTokenChainId: CHAIN_ID,
      senderAddress: deployer.address,
      receiverAddress: deployer.address,
    });

    // console.log("txn", txn);

    await deployer.sendTransaction({
      to: txn.to,
      value: txn.value,
      data: txn.data,
    });

    const wBtcBalBefore = await wbtc.balanceOf(deployer.address);

    expect(wBtcBalBefore).gt(0);

    const unit256Max = ethers.BigNumber.from(
      "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"
    );

    const BeraSBTCData = defaultAbiCoder.encode(
      ["address", "address", "uint256"],
      [wbtc.address, deployer.address, unit256Max]
    );

    const tokens = [WBTC];
    const amounts = [wBtcBalBefore];
    const targets = [stakeStoneBeraSBTCAdapter.address];
    const data = [BeraSBTCData];
    const value = [0];
    const callType = [2];
    // const feeInfo = [{ fee: 0, recipient: zeroAddress() }];

    const fee = ["0"];
    const feeData = defaultAbiCoder.encode(
      ["uint256[]", "uint96[]", "address[]", "uint256[]", "bool"],
      [["1"], fee, tokens, amounts, true]
    );

    const balBefore = await ethers.provider.getBalance(deployer.address);
    const beraSBTCBalBefore = await beraSBTC.balanceOf(deployer.address);

    await wbtc.approve(batchTransaction.address, ethers.constants.MaxUint256);

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
    const beraSBTCBalAfter = await beraSBTC.balanceOf(deployer.address);

    expect(balBefore).gt(balAfter);
    expect(beraSBTCBalAfter).gt(beraSBTCBalBefore);
  });
});
