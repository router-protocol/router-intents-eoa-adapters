import hardhat, { ethers, waffle } from "hardhat";
import { expect } from "chai";
import { RPC } from "../constants";
import { DEXSPAN, DEFAULT_ENV, NATIVE, WNATIVE } from "../../tasks/constants";
import { LidoStakeEth__factory } from "../../typechain/factories/LidoStakeEth__factory";
import { TokenInterface__factory } from "../../typechain/factories/TokenInterface__factory";
import { MockAssetForwarder__factory } from "../../typechain/factories/MockAssetForwarder__factory";
import { BatchTransaction__factory } from "../../typechain/factories/BatchTransaction__factory";
import { defaultAbiCoder } from "ethers/lib/utils";
import { DexSpanAdapter__factory } from "../../typechain/factories/DexSpanAdapter__factory";
import { ILidoZkSyncBridge__factory } from "../../typechain/factories/ILidoZkSyncBridge__factory";
import { IZkSync__factory } from "../../typechain/factories/IZkSync__factory";
import { IScrollMessageQueue__factory } from "../../typechain/factories/IScrollMessageQueue__factory";
import {
  LIDO_ST_ETH,
  LIDO_WST_ETH,
  LIDO_ARBITRUM_GATEWAY,
  LIDO_BASE_GATEWAY,
  LIDO_LINEA_GATEWAY,
  LIDO_MANTLE_GATEWAY,
  LIDO_OPTIMISM_GATEWAY,
  LIDO_ZKSYNC_GATEWAY,
  SCROLL_MESSAGING_QUEUE,
  LIDO_SCROLL_GATEWAY,
} from "../../tasks/deploy/lido/constants";

const CHAIN_ID = "1";
const LIDO_REFERRAL_ADDRESS = "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84";
const NATIVE_TOKEN = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const USDT = "0xdac17f958d2ee523a2206206994597c13d831ec7";

describe("LidoStakeEth Adapter: ", async () => {
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
      NATIVE,
      WNATIVE[env][CHAIN_ID],
      mockAssetForwarder.address,
      DEXSPAN[env][CHAIN_ID]
    );

    const DexSpanAdapter = await ethers.getContractFactory("DexSpanAdapter");
    const dexSpanAdapter = await DexSpanAdapter.deploy(
      NATIVE,
      WNATIVE[env][CHAIN_ID],
      DEXSPAN[env][CHAIN_ID]
    );

    const LidoStakeEth = await ethers.getContractFactory("LidoStakeEth");
    const lidoStakeEthAdapter = await LidoStakeEth.deploy(
      NATIVE,
      WNATIVE[env][CHAIN_ID],
      LIDO_ST_ETH[CHAIN_ID],
      LIDO_WST_ETH[CHAIN_ID],
      LIDO_REFERRAL_ADDRESS,
      LIDO_ARBITRUM_GATEWAY[CHAIN_ID],
      LIDO_BASE_GATEWAY[CHAIN_ID],
      LIDO_LINEA_GATEWAY[CHAIN_ID],
      LIDO_MANTLE_GATEWAY[CHAIN_ID],
      LIDO_OPTIMISM_GATEWAY[CHAIN_ID],
      LIDO_ZKSYNC_GATEWAY[CHAIN_ID],
      LIDO_SCROLL_GATEWAY[CHAIN_ID],
      SCROLL_MESSAGING_QUEUE[CHAIN_ID],
      LIDO_WST_ETH["10"],
      LIDO_WST_ETH["8453"],
      LIDO_WST_ETH["5000"]
    );

    await batchTransaction.setAdapterWhitelist(
      [dexSpanAdapter.address, lidoStakeEthAdapter.address],
      [true, true]
    );

    return {
      batchTransaction: BatchTransaction__factory.connect(
        batchTransaction.address,
        deployer
      ),
      lidoStakeEthAdapter: LidoStakeEth__factory.connect(
        lidoStakeEthAdapter.address,
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
      steth: TokenInterface__factory.connect(LIDO_ST_ETH[CHAIN_ID], deployer),
      wstEth: TokenInterface__factory.connect(LIDO_WST_ETH[CHAIN_ID], deployer),
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

  it("Can stake on lido on same chain", async () => {
    const { batchTransaction, lidoStakeEthAdapter, steth } = await setupTests();

    const amount = ethers.utils.parseEther("1");

    const lidoData = defaultAbiCoder.encode(
      ["address", "uint256", "uint256", "bytes"],
      [deployer.address, ethers.constants.MaxUint256, 0, "0x"]
    );

    const tokens = [NATIVE_TOKEN];
    const amounts = [amount];
    const targets = [lidoStakeEthAdapter.address];
    const data = [lidoData];
    const value = [0];
    const callType = [2];

    const balBefore = await ethers.provider.getBalance(deployer.address);
    const stethBalBefore = await steth.balanceOf(deployer.address);

    await batchTransaction.executeBatchCallsSameChain(
      0,
      tokens,
      amounts,
      targets,
      value,
      callType,
      data,
      { value: amount, gasLimit: 1000000 }
    );

    const balAfter = await ethers.provider.getBalance(deployer.address);
    const stethBalAfter = await steth.balanceOf(deployer.address);

    expect(balBefore).gt(balAfter);
    expect(stethBalAfter).gt(stethBalBefore);
  });

  it("Can stake ETH on Lido on dest chain when instruction is received from BatchTransaction contract", async () => {
    const { batchTransaction, lidoStakeEthAdapter, steth, mockAssetForwarder } =
      await setupTests();

    const amount = ethers.utils.parseEther("1");

    const targets = [lidoStakeEthAdapter.address];
    const data = [
      defaultAbiCoder.encode(
        ["address", "uint256", "uint256", "bytes"],
        [deployer.address, amount, 0, "0x"]
      ),
    ];
    const value = [0];
    const callType = [2];

    const assetForwarderData = defaultAbiCoder.encode(
      ["uint256", "address", "address[]", "uint256[]", "uint256[]", "bytes[]"],
      [0, deployer.address, targets, value, callType, data]
    );

    const balBefore = await ethers.provider.getBalance(deployer.address);
    const stethBalBefore = await steth.balanceOf(deployer.address);

    await mockAssetForwarder.handleMessage(
      NATIVE_TOKEN,
      amount,
      assetForwarderData,
      batchTransaction.address,
      { value: amount, gasLimit: 1000000 }
    );

    const balAfter = await ethers.provider.getBalance(deployer.address);
    const stethBalAfter = await steth.balanceOf(deployer.address);

    expect(balAfter).lt(balBefore);
    expect(stethBalAfter).gt(stethBalBefore);
  });

  it("Can stake ETH on Lido and bridge it to Arbitrum", async () => {
    const { batchTransaction, lidoStakeEthAdapter, wstEth } =
      await setupTests();

    const amount = ethers.utils.parseEther("1");

    const destChain = "42161"; // arbitrum
    // Values taken from tx: https://etherscan.io/tx/0x806c774849467ffdd33ff749edfd8fd9fa585fda7cfc8aeb191c808e21890158
    const maxGas = "88543";
    const gasPrice = "100000000";
    const maxSubmissionCost = "1117588711172000";

    const bridgeData = defaultAbiCoder.encode(
      ["address", "uint256", "uint256", "uint256", "uint256"],
      [
        deployer.address,
        ethers.constants.MaxUint256,
        maxGas,
        gasPrice,
        maxSubmissionCost,
      ]
    );

    const bridgeFee =
      BigInt(maxSubmissionCost) + BigInt(maxGas) * BigInt(gasPrice);

    const lidoData = defaultAbiCoder.encode(
      ["address", "uint256", "uint256", "bytes"],
      [deployer.address, ethers.constants.MaxUint256, destChain, bridgeData]
    );

    const totalAmt = amount.add(bridgeFee.toString());

    const tokens = [NATIVE_TOKEN];
    const amounts = [totalAmt];
    const targets = [lidoStakeEthAdapter.address];
    const data = [lidoData];
    const value = [0];
    const callType = [2];

    const wstEthBalBefore = await wstEth.balanceOf(
      LIDO_ARBITRUM_GATEWAY[CHAIN_ID]
    );

    await batchTransaction.executeBatchCallsSameChain(
      0,
      tokens,
      amounts,
      targets,
      value,
      callType,
      data,
      { value: totalAmt, gasLimit: 1000000 }
    );

    const wstEthBalAfter = await wstEth.balanceOf(
      LIDO_ARBITRUM_GATEWAY[CHAIN_ID]
    );

    expect(wstEthBalAfter).gt(wstEthBalBefore);
  });

  it("Can stake ETH on Lido and bridge it to Optimism", async () => {
    const { batchTransaction, lidoStakeEthAdapter, wstEth } =
      await setupTests();

    const amount = ethers.utils.parseEther("1");

    const destChain = "10"; // optimism
    const l2Gas = "200000";

    const bridgeData = defaultAbiCoder.encode(
      ["address", "uint256", "uint256", "bytes"],
      [deployer.address, ethers.constants.MaxUint256, l2Gas, "0x"]
    );

    const lidoData = defaultAbiCoder.encode(
      ["address", "uint256", "uint256", "bytes"],
      [deployer.address, ethers.constants.MaxUint256, destChain, bridgeData]
    );

    const tokens = [NATIVE_TOKEN];
    const amounts = [amount];
    const targets = [lidoStakeEthAdapter.address];
    const data = [lidoData];
    const value = [0];
    const callType = [2];

    const wstEthBalBefore = await wstEth.balanceOf(
      LIDO_OPTIMISM_GATEWAY[CHAIN_ID]
    );

    await batchTransaction.executeBatchCallsSameChain(
      0,
      tokens,
      amounts,
      targets,
      value,
      callType,
      data,
      { value: amount, gasLimit: 1000000 }
    );

    const wstEthBalAfter = await wstEth.balanceOf(
      LIDO_OPTIMISM_GATEWAY[CHAIN_ID]
    );

    expect(wstEthBalAfter).gt(wstEthBalBefore);
  });

  it("Can stake ETH on Lido and bridge it to Mantle", async () => {
    const { batchTransaction, lidoStakeEthAdapter, wstEth } =
      await setupTests();

    const amount = ethers.utils.parseEther("1");

    const destChain = "5000"; // mantle
    const l2Gas = "200000";

    const bridgeData = defaultAbiCoder.encode(
      ["address", "uint256", "uint256", "bytes"],
      [deployer.address, ethers.constants.MaxUint256, l2Gas, "0x"]
    );

    const lidoData = defaultAbiCoder.encode(
      ["address", "uint256", "uint256", "bytes"],
      [deployer.address, ethers.constants.MaxUint256, destChain, bridgeData]
    );

    const tokens = [NATIVE_TOKEN];
    const amounts = [amount];
    const targets = [lidoStakeEthAdapter.address];
    const data = [lidoData];
    const value = [0];
    const callType = [2];

    const wstEthBalBefore = await wstEth.balanceOf(
      LIDO_MANTLE_GATEWAY[CHAIN_ID]
    );

    await batchTransaction.executeBatchCallsSameChain(
      0,
      tokens,
      amounts,
      targets,
      value,
      callType,
      data,
      { value: amount, gasLimit: 1000000 }
    );

    const wstEthBalAfter = await wstEth.balanceOf(
      LIDO_MANTLE_GATEWAY[CHAIN_ID]
    );

    expect(wstEthBalAfter).gt(wstEthBalBefore);
  });

  it("Can stake ETH on Lido and bridge it to Base", async () => {
    const { batchTransaction, lidoStakeEthAdapter, wstEth } =
      await setupTests();

    const amount = ethers.utils.parseEther("1");

    const destChain = "8453"; // Base
    const l2Gas = "200000";

    const bridgeData = defaultAbiCoder.encode(
      ["address", "uint256", "uint256", "bytes"],
      [deployer.address, ethers.constants.MaxUint256, l2Gas, "0x"]
    );

    const lidoData = defaultAbiCoder.encode(
      ["address", "uint256", "uint256", "bytes"],
      [deployer.address, ethers.constants.MaxUint256, destChain, bridgeData]
    );

    const tokens = [NATIVE_TOKEN];
    const amounts = [amount];
    const targets = [lidoStakeEthAdapter.address];
    const data = [lidoData];
    const value = [0];
    const callType = [2];

    const wstEthBalBefore = await wstEth.balanceOf(LIDO_BASE_GATEWAY[CHAIN_ID]);

    await batchTransaction.executeBatchCallsSameChain(
      0,
      tokens,
      amounts,
      targets,
      value,
      callType,
      data,
      { value: amount, gasLimit: 1000000 }
    );

    const wstEthBalAfter = await wstEth.balanceOf(LIDO_BASE_GATEWAY[CHAIN_ID]);

    expect(wstEthBalAfter).gt(wstEthBalBefore);
  });

  it("Can stake ETH on Lido and bridge it to ZkSync", async () => {
    const { batchTransaction, lidoStakeEthAdapter, wstEth } =
      await setupTests();

    const amount = ethers.utils.parseEther("1");

    const destChain = "324"; // ZkSync
    const l2Gas = "416250";

    const zkSyncGateway = ILidoZkSyncBridge__factory.connect(
      LIDO_ZKSYNC_GATEWAY[CHAIN_ID],
      deployer
    );
    const zkSyncBridgeAddr = await zkSyncGateway.zkSync();
    const zkSyncBridge = IZkSync__factory.connect(zkSyncBridgeAddr, deployer);
    const gasPrice = await ethers.provider.getGasPrice();
    const l2TxCost = await zkSyncBridge.l2TransactionBaseCost(
      gasPrice,
      l2Gas,
      800
    );
    const totalAmt = (
      BigInt(amount.toString()) + BigInt(l2TxCost.toString())
    ).toString();

    const bridgeData = defaultAbiCoder.encode(
      ["address", "address", "uint256", "uint256"],
      [deployer.address, deployer.address, ethers.constants.MaxUint256, l2Gas]
    );

    const lidoData = defaultAbiCoder.encode(
      ["address", "uint256", "uint256", "bytes"],
      [deployer.address, ethers.constants.MaxUint256, destChain, bridgeData]
    );

    const tokens = [NATIVE_TOKEN];
    const amounts = [totalAmt];
    const targets = [lidoStakeEthAdapter.address];
    const data = [lidoData];
    const value = [0];
    const callType = [2];

    const wstEthBalBefore = await wstEth.balanceOf(
      LIDO_ZKSYNC_GATEWAY[CHAIN_ID]
    );

    await batchTransaction.executeBatchCallsSameChain(
      0,
      tokens,
      amounts,
      targets,
      value,
      callType,
      data,
      { value: totalAmt, gasPrice, gasLimit: 1000000 }
    );

    const wstEthBalAfter = await wstEth.balanceOf(
      LIDO_ZKSYNC_GATEWAY[CHAIN_ID]
    );

    expect(wstEthBalAfter).gt(wstEthBalBefore);
  });

  it("Can stake ETH on Lido and bridge it to Linea", async () => {
    const { batchTransaction, lidoStakeEthAdapter, wstEth } =
      await setupTests();

    const amount = ethers.utils.parseEther("1");

    const destChain = "59144"; // Linea

    const bridgeData = defaultAbiCoder.encode(
      ["address", "uint256"],
      [deployer.address, ethers.constants.MaxUint256]
    );

    const lidoData = defaultAbiCoder.encode(
      ["address", "uint256", "uint256", "bytes"],
      [deployer.address, ethers.constants.MaxUint256, destChain, bridgeData]
    );

    const tokens = [NATIVE_TOKEN];
    const amounts = [amount];
    const targets = [lidoStakeEthAdapter.address];
    const data = [lidoData];
    const value = [0];
    const callType = [2];

    const wstEthBalBefore = await wstEth.balanceOf(
      LIDO_LINEA_GATEWAY[CHAIN_ID]
    );

    await batchTransaction.executeBatchCallsSameChain(
      0,
      tokens,
      amounts,
      targets,
      value,
      callType,
      data,
      { value: amount, gasLimit: 1000000 }
    );

    const wstEthBalAfter = await wstEth.balanceOf(LIDO_LINEA_GATEWAY[CHAIN_ID]);

    expect(wstEthBalAfter).gt(wstEthBalBefore);
  });

  it.only("Can stake ETH on Lido and bridge it to Scroll", async () => {
    const { batchTransaction, lidoStakeEthAdapter, wstEth } =
      await setupTests();

    const amount = ethers.utils.parseEther("1");

    const destChain = "534352"; // Scroll

    const bridgeData = defaultAbiCoder.encode(
      ["uint256"],
      [ethers.constants.MaxUint256]
    );

    const lidoData = defaultAbiCoder.encode(
      ["address", "uint256", "uint256", "bytes"],
      [deployer.address, ethers.constants.MaxUint256, destChain, bridgeData]
    );

    const scrollMessageQueue = IScrollMessageQueue__factory.connect(
      SCROLL_MESSAGING_QUEUE[CHAIN_ID],
      deployer
    );
    const fee = await scrollMessageQueue.estimateCrossDomainMessageFee(
      "180000"
    );

    const tokens = [NATIVE_TOKEN];
    const amounts = [amount.add(fee)];
    const targets = [lidoStakeEthAdapter.address];
    const data = [lidoData];
    const value = [0];
    const callType = [2];

    const LIDO_L1_SCROLL_GATEWAY = "0x6625C6332c9F91F2D27c304E729B86db87A3f504";

    const wstEthBalBefore = await wstEth.balanceOf(LIDO_L1_SCROLL_GATEWAY);

    await batchTransaction.executeBatchCallsSameChain(
      0,
      tokens,
      amounts,
      targets,
      value,
      callType,
      data,
      { value: amount.add(fee), gasLimit: 1000000 }
    );

    const wstEthBalAfter = await wstEth.balanceOf(LIDO_L1_SCROLL_GATEWAY);

    expect(wstEthBalAfter).gt(wstEthBalBefore);
  });
});
