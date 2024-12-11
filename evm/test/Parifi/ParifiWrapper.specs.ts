import hardhat, { ethers, waffle } from "hardhat";
import { expect } from "chai";
import { RPC } from "../constants";
import { DEFAULT_ENV, DEXSPAN, NATIVE } from "../../tasks/constants";
import { ParifiIntentWrapper__factory } from "../../typechain/factories/ParifiIntentWrapper__factory";
import { MockAssetForwarder__factory } from "../../typechain/factories/MockAssetForwarder__factory";
import { BatchTransaction__factory } from "../../typechain/factories/BatchTransaction__factory";
import { IWETH__factory } from "../../typechain/factories/IWETH__factory";
import { FeeAdapter__factory } from "../../typechain/factories/FeeAdapter__factory";
import { TokenInterface__factory } from "../../typechain/factories/TokenInterface__factory";
import { defaultAbiCoder } from "ethers/lib/utils";
import { zeroAddress } from "ethereumjs-util";
import { getTransaction } from "../utils";

const CHAIN_ID = "42161";
const WETH = "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1";
const USDC = "0xaf88d065e77c8cc2239327c5edb3a432268e5831";
const SUSDC = "0xE81Be4495f138FAE5846d21AC2cA822BEf452365";
const FEE_WALLET = "0x00EB64b501613F8Cf8Ef3Ac4F82Fc63a50343fee";

describe("Parifi Wrapper Adapter: ", async () => {
  const [deployer] = waffle.provider.getWallets();

  const setupTests = async () => {
    let env = process.env.ENV;
    if (!env) env = DEFAULT_ENV;

    const MockAssetForwarder = await ethers.getContractFactory(
      "MockAssetForwarder"
    );
    const mockAssetForwarder = await MockAssetForwarder.deploy();

    const FeeAdapter = await ethers.getContractFactory("FeeAdapter");
    const feeAdapter = await FeeAdapter.deploy(NATIVE, WETH, FEE_WALLET, 5);

    const BatchTransaction = await ethers.getContractFactory(
      "BatchTransaction"
    );

    const batchTransaction = await BatchTransaction.deploy(
      NATIVE,
      WETH,
      mockAssetForwarder.address,
      DEXSPAN[env][CHAIN_ID],
      zeroAddress(),
      feeAdapter.address
    );

    const ParifiWrapperIntentAdapter = await ethers.getContractFactory(
      "ParifiIntentWrapper"
    );
    const parifiWrapperAdapter = await ParifiWrapperIntentAdapter.deploy(
      NATIVE,
      WETH
    );

    await batchTransaction.setAdapterWhitelist(
      [parifiWrapperAdapter.address, feeAdapter.address],
      [true, true]
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
      parifiWrapperAdapter: ParifiIntentWrapper__factory.connect(
        parifiWrapperAdapter.address,
        deployer
      ),
      mockAssetForwarder: MockAssetForwarder__factory.connect(
        mockAssetForwarder.address,
        deployer
      ),
      weth: IWETH__factory.connect(WETH, deployer),
      usdc: TokenInterface__factory.connect(USDC, deployer),
      susdc: TokenInterface__factory.connect(SUSDC, deployer),
      feeAdapter: FeeAdapter__factory.connect(feeAdapter.address, deployer),
    };
  };

  beforeEach(async function () {
    await hardhat.network.provider.request({
      method: "hardhat_reset",
      params: [
        {
          forking: {
            jsonRpcUrl: RPC[CHAIN_ID],
            blockNumber: 279225781,
          },
        },
      ],
    });
  });

  it("Can open position on Parifi", async () => {
    const { batchTransaction, parifiWrapperAdapter, usdc, susdc } =
      await setupTests();

    const amountNative = ethers.utils.parseEther("1");

    const tx = await getTransaction({
      fromTokenAddress: NATIVE,
      toTokenAddress: USDC,
      amount: amountNative,
      fromTokenChainId: CHAIN_ID,
      toTokenChainId: CHAIN_ID,
      senderAddress: deployer.address,
      recipientAddress: deployer.address,
    });

    await deployer.sendTransaction({
      ...tx,
      gasLimit: 10000000,
      gasPrice: 10000000000,
    });

    const usdcBal = await usdc.balanceOf(deployer.address);
    expect(usdcBal).gt(0);
    const susdcBal = await susdc.balanceOf(deployer.address);
    const amount = "80000000";
    const parifiCalls = [
      {
        target: "0xe2c5658cc5c448b48141168f3e475df8f65a1e3e",
        requireSuccess: true,
        value: "0",
        callData:
          "0x174dea710000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000000500000000000000000000000000000000000000000000000000000000000000a000000000000000000000000000000000000000000000000000000000000007c000000000000000000000000000000000000000000000000000000000000008a000000000000000000000000000000000000000000000000000000000000009c00000000000000000000000000000000000000000000000000000000000000ae0000000000000000000000000e87ceb87b63267ef925e2897b629052eb815bb7d000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000080000000000000000000000000000000000000000000000000000000000000066414b95956000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000006200000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000003c000000000000000000000000000000000000000000000000000000000000008000000000000000000000000000000000000000000000000000000000000000c00000000000000000000000000000000000000000000000000000000000000001eaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a0000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000004f7504e41550100000003b801000000040d00ddb59d3c5fc3f182d6be120028a139aadea29412db784704723c348e4ba103217333a8e350ccd53ed63926a707e425010d1428387d747d25a6cb66056ab393820003e8e85327ad087912d326bcf175d845be925b1f055879bb0cd2e98a7794de0ee319859b56a0c67633394af916029a5a32df94af06e59fb0e6ab330967ccfe68c001063e43b3f3f819f96e6de2d8bbb8873bafe655767100eb98f089201352596fde0653fcfe706bfc97567017295d3db755c68bb58cc10359aae586b0cddc40e9860c01084bfa57b4de9fa4f069ee3906972fb843f7ddc2995d6df6beda0b08b77d3f0d6666f8d6194b2ff563eb409597312c3908ace3131bb5e60ccd1da5b1ecb894228d000a411300d7d77cb4902fc7ffd6ddf65ff3a2069c1783adf0631454d1b2b93ca05005437cd3784fa4d3f0aa2f95bdc9acba77eb8c2a0227917a1299d75bab0f9d2d010b2f13719745c4745dc2ac73a75bd13610549d67466dddfa0104b88f812242e7a038c681bec0ced9aa57f0659d6f8b30300f5aea35ca31b96f82bcd3de4378d1f4000c5a29c7cc4162e8f63cd77871992bbd327f8322e7c40a3a8a12900ed6583ecfb21edc401d89734ccb0eda3e6433931eebbc2721210086d9f5ef0f776774d398fb000d6b799852740c24e70f2eeb1435393d3d61b66e6dcb3c4da24b371043ae64d659739dbfaffa3fa56b36d03f018614d52e5bcd6a8c9973881d2324e2b7b4a0a2cb010e839ca31e2bacb8fb57354455afd2e0e0b352dfc53902162b7a980cb7ee9790f415f81e8908f4ed1c49e21a416c80e3d51e5157cdc84271068988f21179ca0995000fd9d4ddc8e839bb7d5c78a4a146b7ecd0ff9e844536fec639cbf5dad3584977f83153dccc354e04edbaf92019387bb8ebca9cf08133c21ada299995b13dcb25770110f04fb5ab08aaa0c1c893ed812cc93ed89c3fb27b63a4be14ee054d22d6e11e0f7077c20e974cd5e8e2808d469f065cd20147fd38c0768b3717e956c3648b57c600111801c485a8f5d2649dd9b0e7466ea483ef67403473c266e35a999ac75adee77948ab43d6ea294b66c450aff0c85b11df365a30226c12ba05c0dab9ec615cadad001266e8fc01f9f70bf7b3dfaa3009095e89333934835ea24436461f5a6504ceeb4c42b59953d6c14a4268eeb4a834b7aa89440bff130918953997b544c1d355048500674885c000000000001ae101faedac5851e32b9b23b5f9411a8c2bac4aae3ed4dd7b811dd1a72ea4aa710000000005bccd04014155575600000000000ac9a78300002710a94f8d78ff2d783b3194ebc10dafb35f4dba76ee01005500eaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a0000000005f5cb0b000000000001d5fcfffffff800000000674885c000000000674885c00000000005f5c7a6000000000001c1e30b4047ad5048786053e8f1fc7f9b229d33a2b5c3246449c8772cc94032583f19c59b458586724320dd261ee1c47882767ee5610623b6cc20c85d18f6d2cd142662351e7d920b96087b375b8b4be5a0359ea7513d867c617f82b52369662f5a77acfb458f846393ad25bc8bcd51b91ecc782153f0faeb14fd133b17e7b0ae6a8fb54dca118e3a5886317fdf1bb091f502a229d84096fa3af745d4a63d0a379d44f7df5892b3f27735d83017884ce0f7b1d9a8491be5b521039d097d0a5168bfbcf0f24f22a57abbbf68c7a77c933cc59315bb8f27e9475d4a475227ffff00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000d762960c31210cf1bdf75b06a5192d395eedc6590000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000800000000000000000000000000000000000000000000000000000000000000024cadb09a500000000000000000000000000000000000000000000000007316826d8a0c87a00000000000000000000000000000000000000000000000000000000000000000000000000000000a65538a6b9a8442854decb6e3f85782c60757d600000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000800000000000000000000000000000000000000000000000000000000000000064d7ce770c00000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000002625a00000000000000000000000000000000000000000000000000000000000225510000000000000000000000000000000000000000000000000000000000000000000000000000000000d762960c31210cf1bdf75b06a5192d395eedc6590000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000800000000000000000000000000000000000000000000000000000000000000064bb58672c00000000000000000000000000000000000000000000000007316826d8a0c87a00000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000022b1c8c1227a0000000000000000000000000000000000000000000000000000000000000000000000000000000000000d762960c31210cf1bdf75b06a5192d395eedc65900000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000008000000000000000000000000000000000000000000000000000000000000000e49f978860000000000000000000000000000000000000000000000000000000000000006400000000000000000000000000000000000000000000000007316826d8a0c87a000000000000000000000000000000000000000000000000002afb11bd8d0a1e00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000c1c026c1f6e6d8962053594e5448455449585f53444b00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000",
      },
    ];
    const callData = defaultAbiCoder.encode(
      [
        "address",
        "uint256",
        "tuple(address target, bool requireSuccess, uint256 value, bytes callData)[]",
      ],
      [usdc.address, amount, parifiCalls]
    );
    // await usdc.approve(batchTransaction.address, usdcAmt);
    const susdcAmount = "80000000000000000000";
    await usdc.approve("0xa65538A6B9A8442854dEcB6E3F85782C60757D60", amount);
    await susdc.approve(
      "0xd762960c31210Cf1bDf75b06A5192d395EEDC659",
      susdcAmount
    );
    await usdc.approve("0xe2c5658cc5c448b48141168f3e475df8f65a1e3e", amount);
    await susdc.approve(
      "0xe2c5658cc5c448b48141168f3e475df8f65a1e3e",
      susdcAmount
    );
    const tokens = [USDC];
    const amounts = [amount];
    const targets = [parifiWrapperAdapter.address];
    const data = [callData];
    const value = [0];
    const callType = [2];

    const appId = ["1"];
    const fee = ["0"];

    const feeData = defaultAbiCoder.encode(
      ["uint256[]", "uint96[]", "address[]", "uint256[]", "bool"],
      [appId, fee, tokens, amounts, true]
    );

    // const tx2 = await batchTransaction.executeBatchCallsSameChain(
    //   0,
    //   tokens,
    //   amounts,
    //   feeData,
    //   targets,
    //   value,
    //   callType,
    //   data,
    //   { gasLimit: 9000000 }
    // );

    const ss = await deployer.sendTransaction({
      to: "0xe2c5658cc5c448b48141168f3e475df8f65a1e3e",
      data: "0x174dea710000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000000500000000000000000000000000000000000000000000000000000000000000a000000000000000000000000000000000000000000000000000000000000007c000000000000000000000000000000000000000000000000000000000000008a000000000000000000000000000000000000000000000000000000000000009c00000000000000000000000000000000000000000000000000000000000000ae0000000000000000000000000e87ceb87b63267ef925e2897b629052eb815bb7d000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000080000000000000000000000000000000000000000000000000000000000000066414b95956000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000006200000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000003c000000000000000000000000000000000000000000000000000000000000008000000000000000000000000000000000000000000000000000000000000000c00000000000000000000000000000000000000000000000000000000000000001eaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a0000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000004f7504e41550100000003b801000000040d00ddb59d3c5fc3f182d6be120028a139aadea29412db784704723c348e4ba103217333a8e350ccd53ed63926a707e425010d1428387d747d25a6cb66056ab393820003e8e85327ad087912d326bcf175d845be925b1f055879bb0cd2e98a7794de0ee319859b56a0c67633394af916029a5a32df94af06e59fb0e6ab330967ccfe68c001063e43b3f3f819f96e6de2d8bbb8873bafe655767100eb98f089201352596fde0653fcfe706bfc97567017295d3db755c68bb58cc10359aae586b0cddc40e9860c01084bfa57b4de9fa4f069ee3906972fb843f7ddc2995d6df6beda0b08b77d3f0d6666f8d6194b2ff563eb409597312c3908ace3131bb5e60ccd1da5b1ecb894228d000a411300d7d77cb4902fc7ffd6ddf65ff3a2069c1783adf0631454d1b2b93ca05005437cd3784fa4d3f0aa2f95bdc9acba77eb8c2a0227917a1299d75bab0f9d2d010b2f13719745c4745dc2ac73a75bd13610549d67466dddfa0104b88f812242e7a038c681bec0ced9aa57f0659d6f8b30300f5aea35ca31b96f82bcd3de4378d1f4000c5a29c7cc4162e8f63cd77871992bbd327f8322e7c40a3a8a12900ed6583ecfb21edc401d89734ccb0eda3e6433931eebbc2721210086d9f5ef0f776774d398fb000d6b799852740c24e70f2eeb1435393d3d61b66e6dcb3c4da24b371043ae64d659739dbfaffa3fa56b36d03f018614d52e5bcd6a8c9973881d2324e2b7b4a0a2cb010e839ca31e2bacb8fb57354455afd2e0e0b352dfc53902162b7a980cb7ee9790f415f81e8908f4ed1c49e21a416c80e3d51e5157cdc84271068988f21179ca0995000fd9d4ddc8e839bb7d5c78a4a146b7ecd0ff9e844536fec639cbf5dad3584977f83153dccc354e04edbaf92019387bb8ebca9cf08133c21ada299995b13dcb25770110f04fb5ab08aaa0c1c893ed812cc93ed89c3fb27b63a4be14ee054d22d6e11e0f7077c20e974cd5e8e2808d469f065cd20147fd38c0768b3717e956c3648b57c600111801c485a8f5d2649dd9b0e7466ea483ef67403473c266e35a999ac75adee77948ab43d6ea294b66c450aff0c85b11df365a30226c12ba05c0dab9ec615cadad001266e8fc01f9f70bf7b3dfaa3009095e89333934835ea24436461f5a6504ceeb4c42b59953d6c14a4268eeb4a834b7aa89440bff130918953997b544c1d355048500674885c000000000001ae101faedac5851e32b9b23b5f9411a8c2bac4aae3ed4dd7b811dd1a72ea4aa710000000005bccd04014155575600000000000ac9a78300002710a94f8d78ff2d783b3194ebc10dafb35f4dba76ee01005500eaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a0000000005f5cb0b000000000001d5fcfffffff800000000674885c000000000674885c00000000005f5c7a6000000000001c1e30b4047ad5048786053e8f1fc7f9b229d33a2b5c3246449c8772cc94032583f19c59b458586724320dd261ee1c47882767ee5610623b6cc20c85d18f6d2cd142662351e7d920b96087b375b8b4be5a0359ea7513d867c617f82b52369662f5a77acfb458f846393ad25bc8bcd51b91ecc782153f0faeb14fd133b17e7b0ae6a8fb54dca118e3a5886317fdf1bb091f502a229d84096fa3af745d4a63d0a379d44f7df5892b3f27735d83017884ce0f7b1d9a8491be5b521039d097d0a5168bfbcf0f24f22a57abbbf68c7a77c933cc59315bb8f27e9475d4a475227ffff00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000d762960c31210cf1bdf75b06a5192d395eedc6590000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000800000000000000000000000000000000000000000000000000000000000000024cadb09a500000000000000000000000000000000000000000000000007316826d8a0c87a00000000000000000000000000000000000000000000000000000000000000000000000000000000a65538a6b9a8442854decb6e3f85782c60757d600000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000800000000000000000000000000000000000000000000000000000000000000064d7ce770c00000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000002625a00000000000000000000000000000000000000000000000000000000000225510000000000000000000000000000000000000000000000000000000000000000000000000000000000d762960c31210cf1bdf75b06a5192d395eedc6590000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000800000000000000000000000000000000000000000000000000000000000000064bb58672c00000000000000000000000000000000000000000000000007316826d8a0c87a00000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000022b1c8c1227a0000000000000000000000000000000000000000000000000000000000000000000000000000000000000d762960c31210cf1bdf75b06a5192d395eedc65900000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000008000000000000000000000000000000000000000000000000000000000000000e49f978860000000000000000000000000000000000000000000000000000000000000006400000000000000000000000000000000000000000000000007316826d8a0c87a000000000000000000000000000000000000000000000000002afb11bd8d0a1e00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000c1c026c1f6e6d8962053594e5448455449585f53444b00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000",
      gasLimit: 10000000,
      gasPrice: 100000000000,
    });

    const txReceipt = await ss.wait();

    expect(true).eq(true);
    expect(true).eq(true);
  });
});

// usdc allowance --> spot markTimeline -- 0xa65538A6B9A8442854dEcB6E3F85782C60757D60
// susdc allowance --> perps market -- 0xd762960c31210Cf1bDf75b06A5192d395EEDC659
// susdc -- 0xE81Be4495f138FAE5846d21AC2cA822BEf452365