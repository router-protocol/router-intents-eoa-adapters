import hardhat, { ethers, waffle } from "hardhat";
import { expect } from "chai";
import { RPC } from "../constants";
import { DEXSPAN, DEFAULT_ENV } from "../../tasks/constants";
import { NitroAdapter__factory } from "../../typechain/factories/NitroAdapter__factory";
import { TokenInterface__factory } from "../../typechain/factories/TokenInterface__factory";
import { MockAssetForwarder__factory } from "../../typechain/factories/MockAssetForwarder__factory";
import { BatchTransaction__factory } from "../../typechain/factories/BatchTransaction__factory";
import { defaultAbiCoder } from "ethers/lib/utils";

const CHAIN_ID = "5";
const NATIVE_TOKEN = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const WNATIVE_TOKEN = "0xB4FBF271143F4FBf7B91A5ded31805e42b2208d6";

const DEPOSIT_DATA_TUPLE =
  "tuple(uint256 partnerId,uint256 amount,uint256 destAmount,address srcToken,address refundRecipient,bytes32 destChainIdBytes)";

describe("Nitro Adapter: ", async () => {
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
      WNATIVE_TOKEN,
      mockAssetForwarder.address,
      DEXSPAN[env][CHAIN_ID]
    );

    const NitroAdapter = await ethers.getContractFactory("NitroAdapter");
    const nitroAdapter = await NitroAdapter.deploy(
      NATIVE_TOKEN,
      WNATIVE_TOKEN,
      mockAssetForwarder.address,
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
      mockAssetForwarder: MockAssetForwarder__factory.connect(
        mockAssetForwarder.address,
        deployer
      ),
      wnative: TokenInterface__factory.connect(WNATIVE_TOKEN, deployer),
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
    const { batchTransaction, nitroAdapter, mockAssetForwarder } =
      await setupTests();

    const amount = ethers.utils.parseEther("1");

    const txType = 1;
    const depositData = {
      partnerId: 0,
      amount,
      destAmount: amount,
      srcToken: NATIVE_TOKEN,
      refundRecipient: deployer.address,
      destChainIdBytes:
        "0x3433313134000000000000000000000000000000000000000000000000000000",
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

    const assetForwarderBalBefore = await ethers.provider.getBalance(
      mockAssetForwarder.address
    );

    await batchTransaction.executeBatchCallsSameChain(
      tokens,
      amounts,
      targets,
      value,
      callType,
      data,
      { value: amount }
    );

    const assetForwarderBalAfter = await ethers.provider.getBalance(
      mockAssetForwarder.address
    );

    expect(assetForwarderBalAfter).gt(assetForwarderBalBefore);
  });

  it("Can send native tokens with instruction from source chain to dest chain using nitro adapter", async () => {
    const { batchTransaction, nitroAdapter, mockAssetForwarder } =
      await setupTests();

    const amount = ethers.utils.parseEther("1");

    const txType = 1;
    const depositData = {
      partnerId: 0,
      amount,
      destAmount: amount,
      srcToken: NATIVE_TOKEN,
      refundRecipient: deployer.address,
      destChainIdBytes:
        "0x3433313134000000000000000000000000000000000000000000000000000000",
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

    const assetForwarderBalBefore = await ethers.provider.getBalance(
      mockAssetForwarder.address
    );

    await batchTransaction.executeBatchCallsSameChain(
      tokens,
      amounts,
      targets,
      value,
      callType,
      data,
      { value: amount }
    );

    const assetForwarderBalAfter = await ethers.provider.getBalance(
      mockAssetForwarder.address
    );

    expect(assetForwarderBalAfter).gt(assetForwarderBalBefore);
  });

  it("Can send erc20 tokens from source chain to dest chain using nitro adapter", async () => {
    const { batchTransaction, nitroAdapter, mockAssetForwarder, wnative } =
      await setupTests();

    const amount = ethers.utils.parseEther("1");
    await wnative.deposit({ value: amount });
    await wnative.approve(batchTransaction.address, amount);

    const txType = 1;
    const depositData = {
      partnerId: 0,
      amount,
      destAmount: amount,
      srcToken: wnative.address,
      refundRecipient: deployer.address,
      destChainIdBytes:
        "0x3433313134000000000000000000000000000000000000000000000000000000",
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
      mockAssetForwarder.address
    );

    await batchTransaction.executeBatchCallsSameChain(
      tokens,
      amounts,
      targets,
      value,
      callType,
      data
    );

    const assetForwarderBalAfter = await wnative.balanceOf(
      mockAssetForwarder.address
    );

    expect(assetForwarderBalAfter).gt(assetForwarderBalBefore);
  });

  it("Can send erc20 tokens with instruction from source chain to dest chain using nitro adapter", async () => {
    const { batchTransaction, nitroAdapter, mockAssetForwarder, wnative } =
      await setupTests();

    const amount = ethers.utils.parseEther("1");
    await wnative.deposit({ value: amount });
    await wnative.approve(batchTransaction.address, amount);

    const txType = 1;
    const depositData = {
      partnerId: 0,
      amount,
      destAmount: amount,
      srcToken: wnative.address,
      refundRecipient: deployer.address,
      destChainIdBytes:
        "0x3433313134000000000000000000000000000000000000000000000000000000",
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
      mockAssetForwarder.address
    );

    await batchTransaction.executeBatchCallsSameChain(
      tokens,
      amounts,
      targets,
      value,
      callType,
      data
    );

    const assetForwarderBalAfter = await wnative.balanceOf(
      mockAssetForwarder.address
    );

    expect(assetForwarderBalAfter).gt(assetForwarderBalBefore);
  });
});
