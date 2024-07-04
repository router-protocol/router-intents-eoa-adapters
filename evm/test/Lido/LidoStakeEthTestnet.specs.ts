import hardhat, { ethers, waffle } from "hardhat";
import { expect } from "chai";
import { RPC } from "../constants";
import { DEFAULT_ENV, NATIVE, WNATIVE } from "../../tasks/constants";
import { LidoStakeEth__factory } from "../../typechain/factories/LidoStakeEth__factory";
import { TokenInterface__factory } from "../../typechain/factories/TokenInterface__factory";
import { MockAssetForwarder__factory } from "../../typechain/factories/MockAssetForwarder__factory";
import { BatchTransaction__factory } from "../../typechain/factories/BatchTransaction__factory";
import { defaultAbiCoder } from "ethers/lib/utils";
import { IScrollMessageQueue__factory } from "../../typechain/factories/IScrollMessageQueue__factory";
import {
  LIDO_ST_ETH,
  LIDO_WST_ETH,
  LIDO_OPTIMISM_GATEWAY,
  SCROLL_MESSAGING_QUEUE,
  LIDO_SCROLL_GATEWAY,
} from "../../tasks/deploy/lido/constants";
import { zeroAddress } from "ethereumjs-util";

const CHAIN_ID = "11155111";
const LIDO_REFERRAL_ADDRESS = "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84";
const NATIVE_TOKEN = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const env = "testnet";

describe("LidoStakeEthTestnet Adapter: ", async () => {
  const [deployer] = waffle.provider.getWallets();

  const setupTests = async () => {
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
      mockAssetForwarder.address,
      zeroAddress()
    );

    const LidoStakeEth = await ethers.getContractFactory("LidoStakeEthTestnet");
    const lidoStakeEthAdapter = await LidoStakeEth.deploy(
      NATIVE,
      WNATIVE[env][CHAIN_ID],
      LIDO_ST_ETH[CHAIN_ID],
      LIDO_WST_ETH[CHAIN_ID],
      LIDO_REFERRAL_ADDRESS,
      LIDO_OPTIMISM_GATEWAY[CHAIN_ID],
      LIDO_SCROLL_GATEWAY[CHAIN_ID],
      SCROLL_MESSAGING_QUEUE[CHAIN_ID],
      LIDO_WST_ETH["11155420"]
    );

    await batchTransaction.setAdapterWhitelist(
      [lidoStakeEthAdapter.address],
      [true]
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
      mockAssetForwarder: MockAssetForwarder__factory.connect(
        mockAssetForwarder.address,
        deployer
      ),
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
    const feeInfo = [{ fee: 0, recipient: zeroAddress() }];

    const balBefore = await ethers.provider.getBalance(deployer.address);
    const stethBalBefore = await steth.balanceOf(deployer.address);

    await batchTransaction.executeBatchCallsSameChain(
      0,
      tokens,
      amounts,
      feeInfo,
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

  it("Can stake ETH on Lido and bridge it to Optimism", async () => {
    const { batchTransaction, lidoStakeEthAdapter, wstEth } =
      await setupTests();

    const amount = ethers.utils.parseEther("1");

    const destChain = "11155420"; // optimism sepolia
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
    const feeInfo = [{ fee: 0, recipient: zeroAddress() }];

    const wstEthBalBefore = await wstEth.balanceOf(
      LIDO_OPTIMISM_GATEWAY[CHAIN_ID]
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
      { value: amount, gasLimit: 1000000 }
    );

    const wstEthBalAfter = await wstEth.balanceOf(
      LIDO_OPTIMISM_GATEWAY[CHAIN_ID]
    );

    expect(wstEthBalAfter).gt(wstEthBalBefore);
  });

  it("Can stake ETH on Lido and bridge it to Scroll", async () => {
    const { batchTransaction, lidoStakeEthAdapter, wstEth } =
      await setupTests();

    const amount = ethers.utils.parseEther("1");

    const destChain = "534351"; // Scroll sepolia

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
    const feeInfo = [{ fee: 0, recipient: zeroAddress() }];

    const LIDO_L1_SCROLL_GATEWAY = "0xF22B24fa7c3168f30b17fd97b71bdd3162DDe029";

    const wstEthBalBefore = await wstEth.balanceOf(LIDO_L1_SCROLL_GATEWAY);

    await batchTransaction.executeBatchCallsSameChain(
      0,
      tokens,
      amounts,
      feeInfo,
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
