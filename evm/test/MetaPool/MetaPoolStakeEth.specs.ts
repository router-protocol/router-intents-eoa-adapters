import hardhat, { ethers, waffle } from "hardhat";
import { expect } from "chai";
import { RPC } from "../constants";
import { DEXSPAN, DEFAULT_ENV, NATIVE, WNATIVE } from "../../tasks/constants";
import { MetaPoolStakeEth__factory } from "../../typechain/factories/MetaPoolStakeEth__factory";
import { TokenInterface__factory } from "../../typechain/factories/TokenInterface__factory";
import { MockAssetForwarder__factory } from "../../typechain/factories/MockAssetForwarder__factory";
import { BatchTransaction__factory } from "../../typechain/factories/BatchTransaction__factory";
import { defaultAbiCoder } from "ethers/lib/utils";
import { DexSpanAdapter__factory } from "../../typechain/factories/DexSpanAdapter__factory";
import { zeroAddress } from "ethereumjs-util";

const CHAIN_ID = "5";
const MPETH_TOKEN = "0x748c905130CC15b92B97084Fd1eEBc2d2419146f";
const METAPOOL_POOL = "0x748c905130CC15b92B97084Fd1eEBc2d2419146f";
const NATIVE_TOKEN = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const USDT = "0x2227E4764be4c858E534405019488D9E5890Ff9E";

describe("MetaPoolStakeEth Adapter: ", async () => {
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
      DEXSPAN[env][CHAIN_ID],
      zeroAddress(),
      zeroAddress()
    );

    const DexSpanAdapter = await ethers.getContractFactory("DexSpanAdapter");
    const dexSpanAdapter = await DexSpanAdapter.deploy(
      NATIVE,
      WNATIVE[env][CHAIN_ID],
      DEXSPAN[env][CHAIN_ID]
    );

    const MetaPoolStakeEth = await ethers.getContractFactory(
      "MetaPoolStakeEth"
    );
    const metaPoolStakeEthAdapter = await MetaPoolStakeEth.deploy(
      NATIVE,
      WNATIVE[env][CHAIN_ID],
      MPETH_TOKEN,
      METAPOOL_POOL
    );

    await batchTransaction.setAdapterWhitelist(
      [dexSpanAdapter.address, metaPoolStakeEthAdapter.address],
      [true, true]
    );

    return {
      batchTransaction: BatchTransaction__factory.connect(
        batchTransaction.address,
        deployer
      ),
      metaPoolStakeEthAdapter: MetaPoolStakeEth__factory.connect(
        metaPoolStakeEthAdapter.address,
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
      mpEth: TokenInterface__factory.connect(MPETH_TOKEN, deployer),
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

  it("Can stake on metaPool on same chain", async () => {
    const { batchTransaction, metaPoolStakeEthAdapter, mpEth } =
      await setupTests();

    const amount = ethers.utils.parseEther("1");

    const metaPoolData = defaultAbiCoder.encode(
      ["address", "uint256"],
      [deployer.address, amount]
    );

    const tokens = [NATIVE_TOKEN];
    const amounts = [amount];
    const targets = [metaPoolStakeEthAdapter.address];
    const data = [metaPoolData];
    const value = [0];
    const callType = [2];
    // const feeInfo = [{ fee: 0, recipient: zeroAddress() }];

    const balBefore = await ethers.provider.getBalance(deployer.address);
    const mpEthBalBefore = await mpEth.balanceOf(deployer.address);

    await batchTransaction.executeBatchCallsSameChain(
      0,
      tokens,
      amounts,
      "",
      targets,
      value,
      callType,
      data,
      { value: amount }
    );

    const balAfter = await ethers.provider.getBalance(deployer.address);
    const mpEthBalAfter = await mpEth.balanceOf(deployer.address);

    expect(balBefore).gt(balAfter);
    expect(mpEthBalAfter).gt(mpEthBalBefore);
  });

  it("Can stake ETH on MetaPool on dest chain when instruction is received from BatchTransaction contract", async () => {
    const {
      batchTransaction,
      metaPoolStakeEthAdapter,
      mpEth,
      mockAssetForwarder,
    } = await setupTests();

    const amount = "100000000000000000";

    const targets = [metaPoolStakeEthAdapter.address];
    const data = [
      defaultAbiCoder.encode(
        ["address", "uint256"],
        [deployer.address, amount]
      ),
    ];
    const value = [0];
    const callType = [2];

    const assetForwarderData = defaultAbiCoder.encode(
      ["uint256", "address", "address[]", "uint256[]", "uint256[]", "bytes[]"],
      [0, deployer.address, targets, value, callType, data]
    );

    const balBefore = await ethers.provider.getBalance(deployer.address);
    const mpEthBalBefore = await mpEth.balanceOf(deployer.address);

    await mockAssetForwarder.handleMessage(
      NATIVE_TOKEN,
      amount,
      assetForwarderData,
      batchTransaction.address,
      { value: amount }
    );

    const balAfter = await ethers.provider.getBalance(deployer.address);
    const mpEthBalAfter = await mpEth.balanceOf(deployer.address);

    expect(balAfter).lt(balBefore);
    expect(mpEthBalAfter).gt(mpEthBalBefore);
  });
});
