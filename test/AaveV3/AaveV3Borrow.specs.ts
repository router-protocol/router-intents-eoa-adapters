import hardhat, { ethers, waffle } from "hardhat";
import { expect } from "chai";
import { RPC } from "../constants";
import {
  DEXSPAN,
  DEFAULT_ENV,
  DEFAULT_REFUND_ADDRESS,
} from "../../tasks/constants";
import { TokenInterface__factory } from "../../typechain/factories/TokenInterface__factory";
import { MockAssetForwarder__factory } from "../../typechain/factories/MockAssetForwarder__factory";
import { BatchTransaction__factory } from "../../typechain/factories/BatchTransaction__factory";
import { AaveV3Borrow__factory } from "../../typechain/factories/AaveV3Borrow__factory";
import { IPoolV3__factory } from "../../typechain/factories/IPoolV3__factory";
import { defaultAbiCoder } from "ethers/lib/utils";
import { AaveV3Supply__factory } from "../../typechain/factories/AaveV3Supply__factory";

const CHAIN_ID = "80001";
const AAVE_V3_POOL = "0xcC6114B983E4Ed2737E9BD3961c9924e6216c704";
const AAVE_V3_WRAPPED_TOKEN_GATEWAY =
  "0x8dA9412AbB78db20d0B496573D9066C474eA21B8";
const AAVE_V3_REFERRAL_CODE = 0;
const NATIVE_TOKEN = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const WMATIC = "0xaD3C5a67275dE4b5554CdD1d961e957f408eF75a";
const A_WMATIC_ADDRESS = "0xaCA5e6a7117F54B34B476aB95Bf3034c304e7a81";
const USDC_STABLE_DEBT_TOKEN = "0x0b03Ad2929926505EDE0958EF6454f291808c4c9";
const USDC = "0x52D800ca262522580CeBAD275395ca6e7598C014";

const AAVE_DEBT_TOKEN_ABI = [
  "function approveDelegation(address delegatee, uint256 amount) external",
  "function transfer(address _receiver, uint256 _value) public returns (bool success)",
  "function transferFrom(address, address, uint256) public returns (bool)",
  "function approve(address _spender, uint256 _value) public returns (bool success)",
  "function allowance(address _owner, address _spender) public view returns (uint256 remaining)",
  "function balanceOf(address _owner) public view returns (uint256 balance)",
  "event Approval(address indexed _owner, address indexed _spender, uint256 _value)",
];

describe("AaveV3Borrow Adapter: ", async () => {
  const [deployer] = waffle.provider.getWallets();

  const setupTests = async () => {
    let env = process.env.ENV;
    if (!env) env = DEFAULT_ENV;
    const MockAssetForwarder = await ethers.getContractFactory(
      "MockAssetForwarder"
    );
    const mockAssetForwarder = await MockAssetForwarder.deploy();

    const AaveV3SupplyAdapter = await ethers.getContractFactory("AaveV3Supply");

    const aaveV3SupplyAdapter = await AaveV3SupplyAdapter.deploy(
      NATIVE_TOKEN,
      WMATIC,
      mockAssetForwarder.address,
      DEXSPAN[env][CHAIN_ID],
      DEFAULT_REFUND_ADDRESS,
      AAVE_V3_POOL,
      AAVE_V3_WRAPPED_TOKEN_GATEWAY,
      AAVE_V3_REFERRAL_CODE
    );

    const AaveV3BorrowAdapter = await ethers.getContractFactory("AaveV3Borrow");

    const aaveV3BorrowAdapter = await AaveV3BorrowAdapter.deploy(
      NATIVE_TOKEN,
      WMATIC,
      mockAssetForwarder.address,
      DEXSPAN[env][CHAIN_ID],
      DEFAULT_REFUND_ADDRESS,
      AAVE_V3_POOL,
      AAVE_V3_WRAPPED_TOKEN_GATEWAY,
      AAVE_V3_REFERRAL_CODE
    );

    const BatchTransaction = await ethers.getContractFactory(
      "BatchTransaction"
    );

    const batchTransaction = await BatchTransaction.deploy(
      NATIVE_TOKEN,
      WMATIC,
      mockAssetForwarder.address,
      DEXSPAN[env][CHAIN_ID]
    );

    const wmatic = TokenInterface__factory.connect(WMATIC, deployer);
    const aWmatic = TokenInterface__factory.connect(A_WMATIC_ADDRESS, deployer);
    const usdc = TokenInterface__factory.connect(USDC, deployer);
    const aaveV3Pool = IPoolV3__factory.connect(AAVE_V3_POOL, deployer);
    const usdcStableDebtToken = await ethers.getContractAt(
      AAVE_DEBT_TOKEN_ABI,
      USDC_STABLE_DEBT_TOKEN,
      deployer
    );

    const MockToken = await ethers.getContractFactory("MockToken");
    const mockToken = await MockToken.deploy();
    await mockToken.mint(deployer.address, ethers.utils.parseEther("10000"));

    return {
      aaveV3SupplyAdapter: AaveV3Supply__factory.connect(
        aaveV3SupplyAdapter.address,
        deployer
      ),
      aaveV3BorrowAdapter: AaveV3Borrow__factory.connect(
        aaveV3BorrowAdapter.address,
        deployer
      ),
      batchTransaction: BatchTransaction__factory.connect(
        batchTransaction.address,
        deployer
      ),
      wmatic,
      aWmatic,
      usdc,
      aaveV3Pool,
      usdcStableDebtToken,
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

  it("Can borrow funds on user's behalf", async () => {
    const {
      aWmatic,
      usdc,
      usdcStableDebtToken,
      batchTransaction,
      aaveV3BorrowAdapter,
      aaveV3SupplyAdapter,
    } = await setupTests();

    const supplyAsset = NATIVE_TOKEN;
    const supplyAmount = ethers.utils.parseEther("10");
    const supplyOnBehalfOf = deployer.address;

    const aaveV3SupplyData = defaultAbiCoder.encode(
      ["address", "address", "uint256"],
      [supplyAsset, supplyOnBehalfOf, supplyAmount]
    );

    const borrowAmount = "10000";
    const borrowRateMode = 1; // stable rate
    const borrowAsset = usdc.address;
    const borrowOnBehalfOf = deployer.address;
    const borrowRecipient = deployer.address;

    const aaveV3BorrowData = defaultAbiCoder.encode(
      ["uint256", "uint256", "address", "address", "address"],
      [
        borrowAmount,
        borrowRateMode,
        borrowAsset,
        borrowOnBehalfOf,
        borrowRecipient,
      ]
    );

    const tokens = [supplyAsset];
    const amounts = [supplyAmount];
    const targets = [aaveV3SupplyAdapter.address, aaveV3BorrowAdapter.address];
    const data = [aaveV3SupplyData, aaveV3BorrowData];
    const value = [0, 0];
    const callType = [2, 2];

    await usdcStableDebtToken.approveDelegation(
      batchTransaction.address,
      borrowAmount
    );

    const userBalBefore = await aWmatic.balanceOf(deployer.address);
    const usdcBalBefore = await usdc.balanceOf(deployer.address);
    await batchTransaction.executeBatchCallsSameChain(
      tokens,
      amounts,
      targets,
      value,
      callType,
      data,
      { value: supplyAmount }
    );

    const userBalAfter = await aWmatic.balanceOf(deployer.address);
    const usdcBalAfter = await usdc.balanceOf(deployer.address);

    expect(userBalBefore).eq(0);
    expect(userBalAfter).gt(0);
    expect(usdcBalBefore).eq(0);
    expect(usdcBalAfter).eq(borrowAmount);
  });

  it("Cannot borrow funds cross-chain when handleMessage is called directly on adapter", async () => {
    const { usdc, mockAssetForwarder, aaveV3BorrowAdapter } =
      await setupTests();

    const amount = ethers.utils.parseEther("1");
    const borrowAmount = "10000";
    const borrowRateMode = 1; // stable rate
    const borrowAsset = usdc.address;
    const borrowOnBehalfOf = deployer.address;
    const borrowRecipient = deployer.address;

    const aaveV3BorrowData = defaultAbiCoder.encode(
      ["uint256", "uint256", "address", "address", "address"],
      [
        borrowAmount,
        borrowRateMode,
        borrowAsset,
        borrowOnBehalfOf,
        borrowRecipient,
      ]
    );

    expect(
      await mockAssetForwarder.handleMessage(
        NATIVE_TOKEN,
        amount,
        aaveV3BorrowData,
        aaveV3BorrowAdapter.address,
        { value: amount }
      )
    ).to.emit("UnsupportedOperation");
  });
});
