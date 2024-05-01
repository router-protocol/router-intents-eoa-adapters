import hardhat, { ethers, waffle } from "hardhat";
import { expect } from "chai";
import { RPC } from "../constants";
import { DEXSPAN, DEFAULT_ENV, ASSET_FORWARDER } from "../../tasks/constants";
import { NitroAdapter__factory } from "../../typechain/factories/NitroAdapter__factory";
import { TokenInterface__factory } from "../../typechain/factories/TokenInterface__factory";
import { MockAssetForwarder__factory } from "../../typechain/factories/MockAssetForwarder__factory";
import { BatchTransaction__factory } from "../../typechain/factories/BatchTransaction__factory";
import { IAssetForwarder__factory } from "../../typechain/factories/IAssetForwarder__factory";
import { defaultAbiCoder } from "ethers/lib/utils";
import axios from "axios";

const CHAIN_ID = "42161";
const NATIVE_TOKEN = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const WNATIVE_TOKEN = "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1";
const USDC = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831";
const ETH_CHAIN_ID_BYTES =
  "0x3100000000000000000000000000000000000000000000000000000000000000";

const DEPOSIT_DATA_TUPLE =
  "tuple(uint256 partnerId,uint256 amount,uint256 destAmount,address srcToken,address refundRecipient,bytes32 destChainIdBytes)";

describe("Nitro Adapter: ", async () => {
  const [deployer] = waffle.provider.getWallets();

  const setupTests = async () => {
    let env = process.env.ENV;
    if (!env) env = DEFAULT_ENV;
    const actualAssetForwarder = IAssetForwarder__factory.connect(
      ASSET_FORWARDER[env][CHAIN_ID],
      deployer
    );

    // const MockAssetForwarder = await ethers.getContractFactory(
    //   "MockAssetForwarder"
    // );
    // const mockAssetForwarder = await MockAssetForwarder.deploy();

    const BatchTransaction = await ethers.getContractFactory(
      "BatchTransaction"
    );

    const batchTransaction = await BatchTransaction.deploy(
      NATIVE_TOKEN,
      WNATIVE_TOKEN,
      actualAssetForwarder.address,
      DEXSPAN[env][CHAIN_ID]
    );

    const NitroAdapter = await ethers.getContractFactory("NitroAdapter");
    const nitroAdapter = await NitroAdapter.deploy(
      NATIVE_TOKEN,
      WNATIVE_TOKEN,
      actualAssetForwarder.address,
      DEXSPAN[env][CHAIN_ID]
    );

    await batchTransaction.setAdapterWhitelist([nitroAdapter.address], [true]);

    return {
      batchTransaction: BatchTransaction__factory.connect(
        batchTransaction.address,
        deployer
      ),
      nitroAdapter: NitroAdapter__factory.connect(
        nitroAdapter.address,
        deployer
      ),
      // mockAssetForwarder: MockAssetForwarder__factory.connect(
      //   mockAssetForwarder.address,
      //   deployer
      // ),
      wnative: TokenInterface__factory.connect(WNATIVE_TOKEN, deployer),
      actualAssetForwarder,
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

  it("Can send native tokens from source chain to dest chain using nitro adapter", async () => {
    const { batchTransaction, nitroAdapter, actualAssetForwarder, wnative } =
      await setupTests();

    const amount = ethers.utils.parseEther("1");

    const txType = 0;
    const depositData = {
      partnerId: 0,
      amount,
      destAmount: amount,
      srcToken: NATIVE_TOKEN,
      refundRecipient: deployer.address,
      destChainIdBytes: ETH_CHAIN_ID_BYTES,
    };
    const destToken = NATIVE_TOKEN;
    const recipient = deployer.address;
    const message = "0x";

    const nitroData = defaultAbiCoder.encode(
      ["uint8", DEPOSIT_DATA_TUPLE, "bytes", "bytes", "bytes"],
      [txType, depositData, destToken, recipient, message]
    );

    const tokens = [NATIVE_TOKEN];
    const amounts = [amount];
    const targets = [nitroAdapter.address];
    const data = [nitroData];
    const value = [0];
    const callType = [2];

    const assetForwarderBalBefore = await wnative.balanceOf(
      actualAssetForwarder.address
    );

    await batchTransaction.executeBatchCallsSameChain(
      0,
      tokens,
      amounts,
      targets,
      value,
      callType,
      data,
      { value: amount }
    );

    const assetForwarderBalAfter = await wnative.balanceOf(
      actualAssetForwarder.address
    );

    expect(assetForwarderBalAfter).gt(assetForwarderBalBefore);
  });

  it("Can send native tokens with instruction from source chain to dest chain using nitro adapter", async () => {
    const { batchTransaction, nitroAdapter, actualAssetForwarder, wnative } =
      await setupTests();

    const amount = ethers.utils.parseEther("1");

    const txType = 0;
    const depositData = {
      partnerId: 0,
      amount,
      destAmount: amount,
      srcToken: NATIVE_TOKEN,
      refundRecipient: deployer.address,
      destChainIdBytes: ETH_CHAIN_ID_BYTES,
    };
    const destToken = NATIVE_TOKEN;
    const recipient = deployer.address;
    const message = "0x1234567890abcdef";

    const nitroData = defaultAbiCoder.encode(
      ["uint8", DEPOSIT_DATA_TUPLE, "bytes", "bytes", "bytes"],
      [txType, depositData, destToken, recipient, message]
    );

    const tokens = [NATIVE_TOKEN];
    const amounts = [amount];
    const targets = [nitroAdapter.address];
    const data = [nitroData];
    const value = [0];
    const callType = [2];

    const assetForwarderBalBefore = await wnative.balanceOf(
      actualAssetForwarder.address
    );

    await batchTransaction.executeBatchCallsSameChain(
      0,
      tokens,
      amounts,
      targets,
      value,
      callType,
      data,
      { value: amount }
    );

    const assetForwarderBalAfter = await wnative.balanceOf(
      actualAssetForwarder.address
    );

    expect(assetForwarderBalAfter).gt(assetForwarderBalBefore);
  });

  it("Can send erc20 tokens from source chain to dest chain using nitro adapter", async () => {
    const { batchTransaction, nitroAdapter, actualAssetForwarder, wnative } =
      await setupTests();

    const amount = ethers.utils.parseEther("1");
    await wnative.deposit({ value: amount });
    await wnative.approve(batchTransaction.address, amount);

    const txType = 0;
    const depositData = {
      partnerId: 0,
      amount,
      destAmount: amount,
      srcToken: wnative.address,
      refundRecipient: deployer.address,
      destChainIdBytes: ETH_CHAIN_ID_BYTES,
    };
    const destToken = NATIVE_TOKEN;
    const recipient = deployer.address;
    const message = "0x";

    const nitroData = defaultAbiCoder.encode(
      ["uint8", DEPOSIT_DATA_TUPLE, "bytes", "bytes", "bytes"],
      [txType, depositData, destToken, recipient, message]
    );

    const tokens = [wnative.address];
    const amounts = [amount];
    const targets = [nitroAdapter.address];
    const data = [nitroData];
    const value = [0];
    const callType = [2];

    const assetForwarderBalBefore = await wnative.balanceOf(
      actualAssetForwarder.address
    );

    await batchTransaction.executeBatchCallsSameChain(
      0,
      tokens,
      amounts,
      targets,
      value,
      callType,
      data
    );

    const assetForwarderBalAfter = await wnative.balanceOf(
      actualAssetForwarder.address
    );

    expect(assetForwarderBalAfter).gt(assetForwarderBalBefore);
  });

  it("Can send erc20 tokens with instruction from source chain to dest chain using nitro adapter", async () => {
    const { batchTransaction, nitroAdapter, actualAssetForwarder, wnative } =
      await setupTests();

    const amount = ethers.utils.parseEther("1");
    await wnative.deposit({ value: amount });
    await wnative.approve(batchTransaction.address, amount);

    const txType = 0;
    const depositData = {
      partnerId: 0,
      amount,
      destAmount: amount,
      srcToken: wnative.address,
      refundRecipient: deployer.address,
      destChainIdBytes: ETH_CHAIN_ID_BYTES,
    };
    const destToken = NATIVE_TOKEN;
    const recipient = deployer.address;
    const message = "0x1234567890abcdef";

    const nitroData = defaultAbiCoder.encode(
      ["uint8", DEPOSIT_DATA_TUPLE, "bytes", "bytes", "bytes"],
      [txType, depositData, destToken, recipient, message]
    );

    const tokens = [wnative.address];
    const amounts = [amount];
    const targets = [nitroAdapter.address];
    const data = [nitroData];
    const value = [0];
    const callType = [2];

    const assetForwarderBalBefore = await wnative.balanceOf(
      actualAssetForwarder.address
    );

    await batchTransaction.executeBatchCallsSameChain(
      0,
      tokens,
      amounts,
      targets,
      value,
      callType,
      data
    );

    const assetForwarderBalAfter = await wnative.balanceOf(
      actualAssetForwarder.address
    );

    expect(assetForwarderBalAfter).gt(assetForwarderBalBefore);
  });

  it("Can swap and deposit usdc from source chain to dest chain using nitro adapter", async () => {
    const { batchTransaction, nitroAdapter, wnative, actualAssetForwarder } =
      await setupTests();

    const fee = (await actualAssetForwarder.destDetails(ETH_CHAIN_ID_BYTES))[1];

    const amount = ethers.utils.parseEther("1");
    await wnative.deposit({ value: amount });
    await wnative.approve(batchTransaction.address, amount);

    const usdcEth = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";

    const api = "https://api-beta.pathfinder.routerprotocol.com/api/v2/quote";
    const params = {
      fromTokenAddress: wnative.address,
      toTokenAddress: usdcEth,
      amount,
      fromTokenChainId: CHAIN_ID,
      toTokenChainId: "1",
    };
    const { data: quoteData } = await axios.get(api, { params });

    const swapParams = {
      tokens: quoteData.source.path,
      amount,
      minReturn: 0,
      flags: quoteData.source.flags,
      dataTx: quoteData.source.dataTx,
      isWrapper: true,
      recipient: ethers.constants.AddressZero,
      destToken: usdcEth,
    };

    const swapAndDepositData = {
      partnerId: 0,
      destChainIdBytes: ETH_CHAIN_ID_BYTES,
      recipient: deployer.address,
      refundRecipient: deployer.address,
      feeAmount: 0,
      swapData: swapParams,
      message: "0x",
    };

    const SWAP_PARAMS =
      "tuple(address[] tokens, uint256 amount, uint256 minReturn, uint256[] flags, bytes[] dataTx, bool isWrapper, address recipient, bytes destToken)";

    const SWAP_AND_DEPOSIT_DATA = `tuple(uint256 partnerId, bytes32 destChainIdBytes, bytes recipient, address refundRecipient, uint256 feeAmount, ${SWAP_PARAMS} swapData, bytes message) SwapAndDepositData`;

    const txType = 3;

    const nitroData = defaultAbiCoder.encode(
      ["uint8", SWAP_AND_DEPOSIT_DATA],
      [txType, swapAndDepositData]
    );

    const tokens = [NATIVE_TOKEN, wnative.address];
    const amounts = [fee, amount];
    const targets = [nitroAdapter.address];
    const data = [nitroData];
    const value = [0];
    const callType = [2];

    await batchTransaction.executeBatchCallsSameChain(
      0,
      tokens,
      amounts,
      targets,
      value,
      callType,
      data,
      { value: fee }
    );
  });
});
