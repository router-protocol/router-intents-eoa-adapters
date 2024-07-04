import hardhat, { ethers, waffle } from "hardhat";
import { expect } from "chai";
import { RPC } from "../constants";
import {
  DEXSPAN,
  DEFAULT_ENV,
  ASSET_BRIDGE,
  ASSET_FORWARDER,
} from "../../tasks/constants";
import { AssetBridgeAdapter__factory } from "../../typechain/factories/AssetBridgeAdapter__factory";
import { TokenInterface__factory } from "../../typechain/factories/TokenInterface__factory";
import { MockAssetForwarder__factory } from "../../typechain/factories/MockAssetForwarder__factory";
import { BatchTransaction__factory } from "../../typechain/factories/BatchTransaction__factory";
import { IAssetForwarder__factory } from "../../typechain/factories/IAssetForwarder__factory";
import { IAssetBridge__factory } from "../../typechain/factories/IAssetBridge__factory";
import { defaultAbiCoder } from "ethers/lib/utils";
import axios from "axios";
import { getTransaction } from "../utils";
import { MaxUint256 } from "@ethersproject/constants";

const CHAIN_ID = "42161";
const NATIVE_TOKEN = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const PEPE_TOKEN = "0x25d887Ce7a35172C62FeBFD67a1856F20FaEbB00";
const WNATIVE_TOKEN = "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1";
const USDC = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831";
const ETH_CHAIN_ID_BYTES =
  "0x3100000000000000000000000000000000000000000000000000000000000000";

const TRANSFER_PAYLOAD_TUPLE =
  "tuple(bytes32 destChainIdBytes, address srcTokenAddress, uint256 srcTokenAmount, bytes recipient, uint256 partnerId)";

const SWAP_TRANSFER_PAYLOAD_TUPLE =
  "tuple(bytes32 destChainIdBytes, address[] tokens, uint256[] flags, bytes[] dataTx, uint256 srcTokenAmount, uint256 minToAmount, bytes recipient, uint256 partnerId)";

describe("Asset Bridge Adapter: ", async () => {
  const [deployer, alice] = waffle.provider.getWallets();

  const setupTests = async () => {
    let env = process.env.ENV;
    if (!env) env = DEFAULT_ENV;

    const actualAssetForwarder = IAssetForwarder__factory.connect(
      ASSET_FORWARDER[env][CHAIN_ID],
      deployer
    );

    const actualAssetBridge = IAssetBridge__factory.connect(
      ASSET_BRIDGE[env][CHAIN_ID],
      deployer
    );

    const BatchTransaction = await ethers.getContractFactory(
      "BatchTransaction"
    );

    const batchTransaction = await BatchTransaction.deploy(
      NATIVE_TOKEN,
      WNATIVE_TOKEN,
      actualAssetForwarder.address,
      DEXSPAN[env][CHAIN_ID],
      ASSET_BRIDGE[env][CHAIN_ID]
    );

    const AssetBridgeAdapter = await ethers.getContractFactory(
      "AssetBridgeAdapter"
    );
    const assetBridgeAdapter = await AssetBridgeAdapter.deploy(
      NATIVE_TOKEN,
      WNATIVE_TOKEN,
      actualAssetBridge.address
    );

    await batchTransaction.setAdapterWhitelist(
      [assetBridgeAdapter.address],
      [true]
    );

    return {
      batchTransaction: BatchTransaction__factory.connect(
        batchTransaction.address,
        deployer
      ),
      assetBridgeAdapter: AssetBridgeAdapter__factory.connect(
        assetBridgeAdapter.address,
        deployer
      ),
      // mockAssetForwarder: MockAssetForwarder__factory.connect(
      //   mockAssetForwarder.address,
      //   deployer
      // ),
      pepe: TokenInterface__factory.connect(PEPE_TOKEN, deployer),
      wnative: TokenInterface__factory.connect(WNATIVE_TOKEN, deployer),
      actualAssetBridge,
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

  it("Can send reserved tokens from source chain to dest chain using asset bridge adapter", async () => {
    const {
      batchTransaction,
      assetBridgeAdapter,
      actualAssetBridge,
      wnative,
      pepe,
    } = await setupTests();

    await wnative.deposit({ value: ethers.utils.parseEther("0.1") });

    const txn = await getTransaction({
      fromTokenAddress: NATIVE_TOKEN,
      toTokenAddress: PEPE_TOKEN,
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

    const pepeBal = await pepe.balanceOf(deployer.address);

    expect(pepeBal).gt(0);

    const amount = ethers.utils.parseEther("1");

    const txType = 0;
    const transferPayloadData = {
      destChainIdBytes: ETH_CHAIN_ID_BYTES,
      srcTokenAddress: PEPE_TOKEN,
      srcTokenAmount: MaxUint256,
      recipient: deployer.address,
      partnerId: 1,
    };
    const destGasLimit = 0;
    const instruction = "0x";

    const assetbridgeData = defaultAbiCoder.encode(
      ["uint8", TRANSFER_PAYLOAD_TUPLE, "uint64", "bytes"],
      [txType, transferPayloadData, destGasLimit, instruction]
    );

    const tokens = [PEPE_TOKEN];
    const amounts = [amount];
    const feeInfo = [
      { fee: amount.mul(5).div(1000), recipient: alice.address },
    ];
    const targets = [assetBridgeAdapter.address];
    const data = [assetbridgeData];
    const value = [0];
    const callType = [2];

    const assetBridgeBalBefore = await pepe.balanceOf(
      actualAssetBridge.address
    );

    await pepe.approve(batchTransaction.address, amount);

    await batchTransaction.executeBatchCallsSameChain(
      0,
      tokens,
      amounts,
      feeInfo,
      targets,
      value,
      callType,
      data,
      {
        gasLimit: 10000000,
      }
    );

    const assetBridgeBalAfter = await pepe.balanceOf(actualAssetBridge.address);

    expect(assetBridgeBalAfter).gt(assetBridgeBalBefore);
  });

  it("Can send reserved tokens with instruction from source chain to dest chain using asset bridge adapter", async () => {
    const {
      batchTransaction,
      assetBridgeAdapter,
      actualAssetBridge,
      wnative,
      pepe,
    } = await setupTests();

    await wnative.deposit({ value: ethers.utils.parseEther("0.1") });

    const txn = await getTransaction({
      fromTokenAddress: NATIVE_TOKEN,
      toTokenAddress: PEPE_TOKEN,
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

    const pepeBal = await pepe.balanceOf(deployer.address);

    expect(pepeBal).gt(0);

    const amount = ethers.utils.parseEther("1");

    const txType = 0;
    const transferPayloadData = {
      destChainIdBytes: ETH_CHAIN_ID_BYTES,
      srcTokenAddress: PEPE_TOKEN,
      srcTokenAmount: MaxUint256,
      recipient: deployer.address,
      partnerId: 1,
    };
    const destGasLimit = 1000000;
    const instruction = "0x1234567890abcdef";

    const assetbridgeData = defaultAbiCoder.encode(
      ["uint8", TRANSFER_PAYLOAD_TUPLE, "uint64", "bytes"],
      [txType, transferPayloadData, destGasLimit, instruction]
    );

    const tokens = [PEPE_TOKEN];
    const amounts = [amount];
    const feeInfo = [
      { fee: amount.mul(5).div(1000), recipient: alice.address },
    ];
    const targets = [assetBridgeAdapter.address];
    const data = [assetbridgeData];
    const value = [0];
    const callType = [2];

    const assetBridgeBalBefore = await pepe.balanceOf(
      actualAssetBridge.address
    );

    await pepe.approve(batchTransaction.address, amount);

    await batchTransaction.executeBatchCallsSameChain(
      0,
      tokens,
      amounts,
      feeInfo,
      targets,
      value,
      callType,
      data,
      {
        gasLimit: 10000000,
      }
    );

    const assetBridgeBalAfter = await pepe.balanceOf(actualAssetBridge.address);

    expect(assetBridgeBalAfter).gt(assetBridgeBalBefore);
  });

  it("Can swap and deposit reserved tokens without instruction from source chain to dest chain using asset bridge adapter", async () => {
    const {
      batchTransaction,
      assetBridgeAdapter,
      wnative,
      actualAssetBridge,
      pepe,
    } = await setupTests();

    const amount = ethers.utils.parseEther("1");
    // await wnative.deposit({ value: amount });
    // await wnative.approve(batchTransaction.address, amount);

    const api = "https://api-beta.pathfinder.routerprotocol.com/api/v2/quote";
    const params = {
      fromTokenAddress: NATIVE_TOKEN,
      toTokenAddress: PEPE_TOKEN,
      amount,
      fromTokenChainId: CHAIN_ID,
      toTokenChainId: "1",
    };
    const { data: quoteData } = await axios.get(api, { params });

    const swapTransferPayloadData = {
      destChainIdBytes: ETH_CHAIN_ID_BYTES,
      tokens: quoteData.source.path,
      flags: quoteData.source.flags,
      dataTx: quoteData.source.dataTx,
      srcTokenAmount: MaxUint256,
      minToAmount: 0,
      recipient: deployer.address,
      partnerId: 1,
    };

    const txType = 1;
    const destGasLimit = 0;
    const instruction = "0x";

    const assetbridgeData = defaultAbiCoder.encode(
      ["uint8", SWAP_TRANSFER_PAYLOAD_TUPLE, "uint64", "bytes"],
      [txType, swapTransferPayloadData, destGasLimit, instruction]
    );

    const tokens = [NATIVE_TOKEN];
    const amounts = [amount];
    const feeInfo = [
      { fee: amount.mul(5).div(1000), recipient: alice.address },
    ];
    const targets = [assetBridgeAdapter.address];
    const data = [assetbridgeData];
    const value = [0];
    const callType = [2];

    const assetBridgeBalBefore = await pepe.balanceOf(
      actualAssetBridge.address
    );

    await batchTransaction.executeBatchCallsSameChain(
      0,
      tokens,
      amounts,
      feeInfo,
      targets,
      value,
      callType,
      data,
      {
        value: amount,
        gasLimit: 10000000,
      }
    );

    const assetBridgeBalAfter = await pepe.balanceOf(actualAssetBridge.address);

    expect(assetBridgeBalAfter).gt(assetBridgeBalBefore);
  });
});
