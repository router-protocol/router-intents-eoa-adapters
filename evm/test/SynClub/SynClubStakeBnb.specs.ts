import hardhat, { ethers, waffle } from "hardhat";
import { expect } from "chai";
import { RPC } from "../constants";
import { DEXSPAN, DEFAULT_ENV, WNATIVE } from "../../tasks/constants";
import { SynClubStakeBnb__factory } from "../../typechain/factories/SynClubStakeBnb__factory";
import { TokenInterface__factory } from "../../typechain/factories/TokenInterface__factory";
import { MockAssetForwarder__factory } from "../../typechain/factories/MockAssetForwarder__factory";
import { BatchTransaction__factory } from "../../typechain/factories/BatchTransaction__factory";
import { defaultAbiCoder } from "ethers/lib/utils";

const CHAIN_ID = "56";
const SYNCLUB_TOKEN = "0xB0b84D294e0C75A6abe60171b70edEb2EFd14A1B";
const SYNCLUB_POOL = "0x1adB950d8bB3dA4bE104211D5AB038628e477fE6";
const NATIVE_TOKEN = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const USDT = "0x55d398326f99059ff775485246999027b3197955";

describe("SynClubStakeBnb Adapter: ", async () => {
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
      WNATIVE[env][CHAIN_ID],
      mockAssetForwarder.address,
      DEXSPAN[env][CHAIN_ID]
    );

    const SynClubStakeBnb = await ethers.getContractFactory("SynClubStakeBnb");
    const synClubStakeBnbAdapter = await SynClubStakeBnb.deploy(
      NATIVE_TOKEN,
      WNATIVE[env][CHAIN_ID],
      SYNCLUB_TOKEN,
      SYNCLUB_POOL
    );

    await batchTransaction.setAdapterWhitelist(
      [synClubStakeBnbAdapter.address],
      [true]
    );

    return {
      batchTransaction: BatchTransaction__factory.connect(
        batchTransaction.address,
        deployer
      ),
      synClubStakeBnbAdapter: SynClubStakeBnb__factory.connect(
        synClubStakeBnbAdapter.address,
        deployer
      ),
      mockAssetForwarder: MockAssetForwarder__factory.connect(
        mockAssetForwarder.address,
        deployer
      ),
      usdt: TokenInterface__factory.connect(USDT, deployer),
      snBnb: TokenInterface__factory.connect(SYNCLUB_TOKEN, deployer),
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

  it("Can stake on synClub on same chain", async () => {
    const { batchTransaction, synClubStakeBnbAdapter, snBnb } =
      await setupTests();

    const amount = ethers.utils.parseEther("1");

    const synClubData = defaultAbiCoder.encode(
      ["address", "uint256"],
      [deployer.address, amount]
    );

    const tokens = [NATIVE_TOKEN];
    const amounts = [amount];
    const targets = [synClubStakeBnbAdapter.address];
    const data = [synClubData];
    const value = [0];
    const callType = [2];

    const balBefore = await ethers.provider.getBalance(deployer.address);
    const snBnbBalBefore = await snBnb.balanceOf(deployer.address);

    await batchTransaction.executeBatchCallsSameChain(
      tokens,
      amounts,
      targets,
      value,
      callType,
      data,
      { value: amount }
    );

    const balAfter = await ethers.provider.getBalance(deployer.address);
    const snBnbBalAfter = await snBnb.balanceOf(deployer.address);

    expect(balBefore).gt(balAfter);
    expect(snBnbBalAfter).gt(snBnbBalBefore);
  });

  it("Can stake BNB on SynClub on dest chain when instruction is received from BatchTransaction contract", async () => {
    const {
      batchTransaction,
      synClubStakeBnbAdapter,
      snBnb,
      mockAssetForwarder,
    } = await setupTests();

    const amount = "100000000000000000";

    const targets = [synClubStakeBnbAdapter.address];
    const data = [
      defaultAbiCoder.encode(
        ["address", "uint256"],
        [deployer.address, amount]
      ),
    ];
    const value = [0];
    const callType = [2];

    const assetForwarderData = defaultAbiCoder.encode(
      ["address", "address[]", "uint256[]", "uint256[]", "bytes[]"],
      [deployer.address, targets, value, callType, data]
    );

    const balBefore = await ethers.provider.getBalance(deployer.address);
    const snBnbBalBefore = await snBnb.balanceOf(deployer.address);

    await mockAssetForwarder.handleMessage(
      NATIVE_TOKEN,
      amount,
      assetForwarderData,
      batchTransaction.address,
      { value: amount }
    );

    const balAfter = await ethers.provider.getBalance(deployer.address);
    const snBnbBalAfter = await snBnb.balanceOf(deployer.address);

    expect(balAfter).lt(balBefore);
    expect(snBnbBalAfter).gt(snBnbBalBefore);
  });
});
