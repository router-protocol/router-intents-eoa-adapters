import hardhat, { ethers, waffle } from "hardhat";
import { expect } from "chai";
import { RPC } from "../constants";
import { DEXSPAN, DEFAULT_ENV } from "../../tasks/constants";
import { TokenInterface__factory } from "../../typechain/factories/TokenInterface__factory";
import { MockAssetForwarder__factory } from "../../typechain/factories/MockAssetForwarder__factory";
import { BatchTransaction__factory } from "../../typechain/factories/BatchTransaction__factory";
import { LendleBorrow__factory } from "../../typechain/factories/LendleBorrow__factory";
import { ILendingPool__factory } from "../../typechain/factories/ILendingPool__factory";
import { defaultAbiCoder } from "ethers/lib/utils";
import { LendleSupply__factory } from "../../typechain/factories/LendleSupply__factory";
import { zeroAddress } from "ethereumjs-util";

const CHAIN_ID = "5000";
const LENDLE_POOL = "0xCFa5aE7c2CE8Fadc6426C1ff872cA45378Fb7cF3";
const LENDLE_WRAPPED_TOKEN_GATEWAY =
  "0xEc831f8710C6286a91a348928600157f07aC55c2";
const LENDLE_REFERRAL_CODE = 0;
const NATIVE_TOKEN = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const WETH = "0x78c1b0c915c4faa5fffa6cabf0219da63d7f4cb8";
const L_WETH_ADDRESS = "0x683696523512636B46A826A7e3D1B0658E8e2e1c";
const USDT_VARIABLE_DEBT_TOKEN = "0xaC3c14071c80819113DF501E1AB767be910d5e5a";
const USDT = "0x201EBa5CC46D216Ce6DC03F6a759e8E766e956aE";

const LENDLE_DEBT_TOKEN_ABI = [
  "function approveDelegation(address delegatee, uint256 amount) external",
  "function transfer(address _receiver, uint256 _value) public returns (bool success)",
  "function transferFrom(address, address, uint256) public returns (bool)",
  "function approve(address _spender, uint256 _value) public returns (bool success)",
  "function allowance(address _owner, address _spender) public view returns (uint256 remaining)",
  "function balanceOf(address _owner) public view returns (uint256 balance)",
  "event Approval(address indexed _owner, address indexed _spender, uint256 _value)",
];

describe("LendleBorrow Adapter: ", async () => {
  const [deployer] = waffle.provider.getWallets();

  const setupTests = async () => {
    let env = process.env.ENV;
    if (!env) env = DEFAULT_ENV;
    const MockAssetForwarder = await ethers.getContractFactory(
      "MockAssetForwarder"
    );
    const mockAssetForwarder = await MockAssetForwarder.deploy();

    const LendleSupplyAdapter = await ethers.getContractFactory("LendleSupply");

    const lendleSupplyAdapter = await LendleSupplyAdapter.deploy(
      NATIVE_TOKEN,
      WETH,
      LENDLE_POOL,
      LENDLE_WRAPPED_TOKEN_GATEWAY,
      LENDLE_REFERRAL_CODE
    );

    const LendleBorrowAdapter = await ethers.getContractFactory("LendleBorrow");

    const lendleBorrowAdapter = await LendleBorrowAdapter.deploy(
      NATIVE_TOKEN,
      WETH,
      LENDLE_POOL,
      LENDLE_WRAPPED_TOKEN_GATEWAY,
      LENDLE_REFERRAL_CODE
    );

    const BatchTransaction = await ethers.getContractFactory(
      "BatchTransaction"
    );

    const batchTransaction = await BatchTransaction.deploy(
      NATIVE_TOKEN,
      WETH,
      mockAssetForwarder.address,
      DEXSPAN[env][CHAIN_ID]
    );

    await batchTransaction.setAdapterWhitelist(
      [lendleBorrowAdapter.address, lendleSupplyAdapter.address],
      [true, true]
    );

    const weth = TokenInterface__factory.connect(WETH, deployer);
    const lWeth = TokenInterface__factory.connect(L_WETH_ADDRESS, deployer);
    const usdt = TokenInterface__factory.connect(USDT, deployer);
    const lendlePool = ILendingPool__factory.connect(LENDLE_POOL, deployer);
    const usdtVariableDebtToken = await ethers.getContractAt(
      LENDLE_DEBT_TOKEN_ABI,
      USDT_VARIABLE_DEBT_TOKEN,
      deployer
    );

    const MockToken = await ethers.getContractFactory("MockToken");
    const mockToken = await MockToken.deploy();
    await mockToken.mint(deployer.address, ethers.utils.parseEther("10000"));

    return {
      lendleSupplyAdapter: LendleSupply__factory.connect(
        lendleSupplyAdapter.address,
        deployer
      ),
      lendleBorrowAdapter: LendleBorrow__factory.connect(
        lendleBorrowAdapter.address,
        deployer
      ),
      batchTransaction: BatchTransaction__factory.connect(
        batchTransaction.address,
        deployer
      ),
      weth,
      lWeth,
      usdt,
      lendlePool,
      usdtVariableDebtToken,
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
      lWeth,
      usdt,
      usdtVariableDebtToken,
      batchTransaction,
      lendleBorrowAdapter,
      lendleSupplyAdapter,
    } = await setupTests();

    const supplyAsset = NATIVE_TOKEN;
    const supplyAmount = ethers.utils.parseEther("10");
    const supplyOnBehalfOf = deployer.address;

    const lendleSupplyData = defaultAbiCoder.encode(
      ["address", "address", "uint256"],
      [supplyAsset, supplyOnBehalfOf, supplyAmount]
    );

    const borrowAmount = "10000";
    const borrowRateMode = 2; // variable rate
    const borrowAsset = usdt.address;
    const borrowOnBehalfOf = deployer.address;
    const borrowRecipient = deployer.address;

    const lendleBorrowData = defaultAbiCoder.encode(
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
    const targets = [lendleSupplyAdapter.address, lendleBorrowAdapter.address];
    const data = [lendleSupplyData, lendleBorrowData];
    const value = [0, 0];
    const callType = [2, 2];
    const feeInfo = [
      { fee: 0, recipient: zeroAddress() },
      { fee: 0, recipient: zeroAddress() },
    ];

    await usdtVariableDebtToken.approveDelegation(
      batchTransaction.address,
      borrowAmount
    );

    const userBalBefore = await lWeth.balanceOf(deployer.address);
    const usdtBalBefore = await usdt.balanceOf(deployer.address);
    await batchTransaction.executeBatchCallsSameChain(
      0,
      tokens,
      amounts,
      feeInfo,
      targets,
      value,
      callType,
      data,
      { value: supplyAmount }
    );

    const userBalAfter = await lWeth.balanceOf(deployer.address);
    const usdtBalAfter = await usdt.balanceOf(deployer.address);

    expect(userBalBefore).eq(0);
    expect(userBalAfter).gt(0);
    expect(usdtBalBefore).eq(0);
    expect(usdtBalAfter).eq(borrowAmount);
  });
});
