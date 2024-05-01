import hardhat, { ethers, waffle } from "hardhat";
import { expect } from "chai";
import { RPC } from "../constants";
import { DEXSPAN, DEFAULT_ENV, WNATIVE, NATIVE } from "../../tasks/constants";
import { TokenInterface__factory } from "../../typechain/factories/TokenInterface__factory";
import { MockAssetForwarder__factory } from "../../typechain/factories/MockAssetForwarder__factory";
import { BatchTransaction__factory } from "../../typechain/factories/BatchTransaction__factory";
import { MendiSupply__factory } from "../../typechain/factories/MendiSupply__factory";
import { defaultAbiCoder } from "ethers/lib/utils";
import { MENDI_TOKENS } from "../../tasks/deploy/mendi/constants";
import { getTransaction } from "../utils";

const CHAIN_ID = "59144";

describe("MendiSupply Adapter: ", async () => {
  const [deployer, alice] = waffle.provider.getWallets();

  const setupTests = async () => {
    let env = process.env.ENV;
    if (!env) env = DEFAULT_ENV;
    const MockAssetForwarder = await ethers.getContractFactory(
      "MockAssetForwarder"
    );
    const mockAssetForwarder = await MockAssetForwarder.deploy();

    const MendiSupplyAdapter = await ethers.getContractFactory("MendiSupply");

    const mendiSupplyAdapter = await MendiSupplyAdapter.deploy(
      NATIVE,
      WNATIVE[env][CHAIN_ID],
      MENDI_TOKENS[CHAIN_ID]["usdc"].token,
      MENDI_TOKENS[CHAIN_ID]["usdt"].token,
      MENDI_TOKENS[CHAIN_ID]["dai"].token,
      MENDI_TOKENS[CHAIN_ID]["wbtc"].token,
      MENDI_TOKENS[CHAIN_ID]["wstEth"].token,
      MENDI_TOKENS[CHAIN_ID]["weth"].cToken,
      MENDI_TOKENS[CHAIN_ID]["usdc"].cToken,
      MENDI_TOKENS[CHAIN_ID]["usdt"].cToken,
      MENDI_TOKENS[CHAIN_ID]["dai"].cToken,
      MENDI_TOKENS[CHAIN_ID]["wbtc"].cToken,
      MENDI_TOKENS[CHAIN_ID]["wstEth"].cToken
    );

    const BatchTransaction = await ethers.getContractFactory(
      "BatchTransaction"
    );

    const batchTransaction = await BatchTransaction.deploy(
      NATIVE,
      WNATIVE[env][CHAIN_ID],
      mockAssetForwarder.address,
      DEXSPAN[env][CHAIN_ID]
    );

    await batchTransaction.setAdapterWhitelist(
      [mendiSupplyAdapter.address],
      [true]
    );

    const weth = TokenInterface__factory.connect(
      WNATIVE[env][CHAIN_ID],
      deployer
    );
    const meWeth = TokenInterface__factory.connect(
      MENDI_TOKENS[CHAIN_ID]["weth"].cToken,
      deployer
    );
    const usdc = TokenInterface__factory.connect(
      MENDI_TOKENS[CHAIN_ID]["usdc"].token,
      deployer
    );
    const meUsdc = TokenInterface__factory.connect(
      MENDI_TOKENS[CHAIN_ID]["usdc"].cToken,
      deployer
    );
    const usdt = TokenInterface__factory.connect(
      MENDI_TOKENS[CHAIN_ID]["usdt"].token,
      deployer
    );
    const meUsdt = TokenInterface__factory.connect(
      MENDI_TOKENS[CHAIN_ID]["usdt"].cToken,
      deployer
    );
    const dai = TokenInterface__factory.connect(
      MENDI_TOKENS[CHAIN_ID]["dai"].token,
      deployer
    );
    const meDai = TokenInterface__factory.connect(
      MENDI_TOKENS[CHAIN_ID]["dai"].cToken,
      deployer
    );
    const wbtc = TokenInterface__factory.connect(
      MENDI_TOKENS[CHAIN_ID]["wbtc"].token,
      deployer
    );
    const meWbtc = TokenInterface__factory.connect(
      MENDI_TOKENS[CHAIN_ID]["wbtc"].cToken,
      deployer
    );
    const wstEth = TokenInterface__factory.connect(
      MENDI_TOKENS[CHAIN_ID]["wstEth"].token,
      deployer
    );
    const meWstEth = TokenInterface__factory.connect(
      MENDI_TOKENS[CHAIN_ID]["wstEth"].cToken,
      deployer
    );

    const MockToken = await ethers.getContractFactory("MockToken");
    const mockToken = await MockToken.deploy();
    await mockToken.mint(deployer.address, ethers.utils.parseEther("10000"));

    return {
      mendiSupplyAdapter: MendiSupply__factory.connect(
        mendiSupplyAdapter.address,
        deployer
      ),
      batchTransaction: BatchTransaction__factory.connect(
        batchTransaction.address,
        deployer
      ),
      weth,
      meWeth,
      usdc,
      meUsdc,
      usdt,
      meUsdt,
      dai,
      meDai,
      wbtc,
      meWbtc,
      wstEth,
      meWstEth,
      mockAssetForwarder: MockAssetForwarder__factory.connect(
        mockAssetForwarder.address,
        deployer
      ),
      mockToken: TokenInterface__factory.connect(mockToken.address, deployer),
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

  it("Can supply native tokens on mendi weth market", async () => {
    const { mendiSupplyAdapter, meWeth } = await setupTests();

    const amount = ethers.utils.parseEther("1");

    const data = defaultAbiCoder.encode(
      ["address", "address", "uint256"],
      [NATIVE, deployer.address, amount]
    );

    const userBalBefore = await meWeth.balanceOf(deployer.address);
    await mendiSupplyAdapter.execute(data, {
      gasLimit: 10000000,
      value: amount,
    });

    const userBalAfter = await meWeth.balanceOf(deployer.address);

    expect(userBalBefore).eq(0);
    expect(userBalAfter).gt(0);
  });

  it("Can supply usdc on mendi", async () => {
    const { mendiSupplyAdapter, meUsdc, usdc } = await setupTests();

    const swapAmount = ethers.utils.parseEther("1");

    const swapTx = await getTransaction({
      fromTokenAddress: NATIVE,
      toTokenAddress: usdc.address,
      amount: swapAmount.toString(),
      fromTokenChainId: CHAIN_ID,
      toTokenChainId: CHAIN_ID,
      senderAddress: deployer.address,
      receiverAddress: deployer.address,
    });

    await deployer.sendTransaction({
      to: swapTx.to,
      value: swapTx.value,
      data: swapTx.data,
    });

    const amount = await usdc.balanceOf(deployer.address);
    expect(amount).gt(0);

    const data = defaultAbiCoder.encode(
      ["address", "address", "uint256"],
      [usdc.address, deployer.address, amount]
    );

    await usdc.approve(mendiSupplyAdapter.address, amount);

    const recipientBalBefore = await meUsdc.balanceOf(deployer.address);

    await mendiSupplyAdapter.execute(data, {
      gasLimit: 10000000,
    });

    const recipientBalAfter = await meUsdc.balanceOf(deployer.address);

    expect(recipientBalAfter).gt(recipientBalBefore);
  });

  it("Cannot supply tokens on mendi- unsupported market", async () => {
    const { mendiSupplyAdapter, mockToken } = await setupTests();

    const amount = ethers.utils.parseEther("1");

    const data = defaultAbiCoder.encode(
      ["address", "address", "uint256"],
      [mockToken.address, deployer.address, amount]
    );

    await expect(
      mendiSupplyAdapter.execute(data, {
        gasLimit: 10000000,
      })
    ).to.be.reverted;
  });

  it("Can supply native tokens on mendi weth market using BatchTransaction flow", async () => {
    const { mendiSupplyAdapter, weth, meWeth, batchTransaction } =
      await setupTests();

    const amount = ethers.utils.parseEther("1");

    const mendiSupplyData = defaultAbiCoder.encode(
      ["address", "address", "uint256"],
      [NATIVE, alice.address, amount]
    );

    const tokens = [NATIVE];
    const amounts = [amount];
    const targets = [mendiSupplyAdapter.address];
    const data = [mendiSupplyData];
    const value = [0];
    const callType = [2];

    const userBalBefore = await meWeth.balanceOf(alice.address);
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

    const userBalAfter = await meWeth.balanceOf(alice.address);

    expect(userBalAfter).gt(userBalBefore);
  });
});
