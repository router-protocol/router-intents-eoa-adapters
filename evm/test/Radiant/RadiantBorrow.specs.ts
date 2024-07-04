import hardhat, { ethers, waffle } from "hardhat";
import { expect } from "chai";
import { RPC } from "../constants";
import { DEXSPAN, DEFAULT_ENV } from "../../tasks/constants";
import { TokenInterface__factory } from "../../typechain/factories/TokenInterface__factory";
import { MockAssetForwarder__factory } from "../../typechain/factories/MockAssetForwarder__factory";
import { BatchTransaction__factory } from "../../typechain/factories/BatchTransaction__factory";
import { RadiantBorrow__factory } from "../../typechain/factories/RadiantBorrow__factory";
import { ILendingPool__factory } from "../../typechain/factories/ILendingPool__factory";
import { defaultAbiCoder } from "ethers/lib/utils";
import { RadiantSupply__factory } from "../../typechain/factories/RadiantSupply__factory";
import { zeroAddress } from "ethereumjs-util";

const CHAIN_ID = "1";
const RADIANT_POOL = "0xA950974f64aA33f27F6C5e017eEE93BF7588ED07";
const RADIANT_WRAPPED_TOKEN_GATEWAY =
  "0xc46963a9EAF81f5BEB0B11413687f87a874E2D13";
const RADIANT_REFERRAL_CODE = 0;
const NATIVE_TOKEN = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
const R_WETH_ADDRESS = "0xd10c315293872851184F484E9431dAf4dE6AA992";
const USDC_VARIABLE_DEBT_TOKEN = "0x490726291F6434646FEb2eC96d2Cc566b18a122F";
const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";

const RADIANT_DEBT_TOKEN_ABI = [
  "function approveDelegation(address delegatee, uint256 amount) external",
  "function transfer(address _receiver, uint256 _value) public returns (bool success)",
  "function transferFrom(address, address, uint256) public returns (bool)",
  "function approve(address _spender, uint256 _value) public returns (bool success)",
  "function allowance(address _owner, address _spender) public view returns (uint256 remaining)",
  "function balanceOf(address _owner) public view returns (uint256 balance)",
  "event Approval(address indexed _owner, address indexed _spender, uint256 _value)",
];

describe("RadiantBorrow Adapter: ", async () => {
  const [deployer] = waffle.provider.getWallets();

  const setupTests = async () => {
    let env = process.env.ENV;
    if (!env) env = DEFAULT_ENV;
    const MockAssetForwarder = await ethers.getContractFactory(
      "MockAssetForwarder"
    );
    const mockAssetForwarder = await MockAssetForwarder.deploy();

    const RadiantSupplyAdapter = await ethers.getContractFactory(
      "RadiantSupply"
    );

    const radiantSupplyAdapter = await RadiantSupplyAdapter.deploy(
      NATIVE_TOKEN,
      WETH,
      RADIANT_POOL,
      RADIANT_WRAPPED_TOKEN_GATEWAY,
      RADIANT_REFERRAL_CODE
    );

    const RadiantBorrowAdapter = await ethers.getContractFactory(
      "RadiantBorrow"
    );

    const radiantBorrowAdapter = await RadiantBorrowAdapter.deploy(
      NATIVE_TOKEN,
      WETH,
      RADIANT_POOL,
      RADIANT_WRAPPED_TOKEN_GATEWAY,
      RADIANT_REFERRAL_CODE
    );

    const BatchTransaction = await ethers.getContractFactory(
      "BatchTransaction"
    );

    const batchTransaction = await BatchTransaction.deploy(
      NATIVE_TOKEN,
      WETH,
      mockAssetForwarder.address,
      DEXSPAN[env][CHAIN_ID],
      zeroAddress()
    );

    await batchTransaction.setAdapterWhitelist(
      [radiantBorrowAdapter.address, radiantSupplyAdapter.address],
      [true, true]
    );

    const weth = TokenInterface__factory.connect(WETH, deployer);
    const rWeth = TokenInterface__factory.connect(R_WETH_ADDRESS, deployer);
    const usdc = TokenInterface__factory.connect(USDC, deployer);
    const radiantPool = ILendingPool__factory.connect(RADIANT_POOL, deployer);
    const usdcVariableDebtToken = await ethers.getContractAt(
      RADIANT_DEBT_TOKEN_ABI,
      USDC_VARIABLE_DEBT_TOKEN,
      deployer
    );

    const MockToken = await ethers.getContractFactory("MockToken");
    const mockToken = await MockToken.deploy();
    await mockToken.mint(deployer.address, ethers.utils.parseEther("10000"));

    return {
      radiantSupplyAdapter: RadiantSupply__factory.connect(
        radiantSupplyAdapter.address,
        deployer
      ),
      radiantBorrowAdapter: RadiantBorrow__factory.connect(
        radiantBorrowAdapter.address,
        deployer
      ),
      batchTransaction: BatchTransaction__factory.connect(
        batchTransaction.address,
        deployer
      ),
      weth,
      rWeth,
      usdc,
      radiantPool,
      usdcVariableDebtToken,
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
      rWeth,
      usdc,
      usdcVariableDebtToken,
      batchTransaction,
      radiantBorrowAdapter,
      radiantSupplyAdapter,
    } = await setupTests();

    const supplyAsset = NATIVE_TOKEN;
    const supplyAmount = ethers.utils.parseEther("10");
    const supplyOnBehalfOf = deployer.address;

    const radiantSupplyData = defaultAbiCoder.encode(
      ["address", "address", "uint256"],
      [supplyAsset, supplyOnBehalfOf, supplyAmount]
    );

    const borrowAmount = "10000";
    const borrowRateMode = 2; // variable rate
    const borrowAsset = usdc.address;
    const borrowOnBehalfOf = deployer.address;
    const borrowRecipient = deployer.address;

    const radiantBorrowData = defaultAbiCoder.encode(
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
    const targets = [
      radiantSupplyAdapter.address,
      radiantBorrowAdapter.address,
    ];
    const data = [radiantSupplyData, radiantBorrowData];
    const value = [0, 0];
    const callType = [2, 2];
    const feeInfo = [
      { fee: 0, recipient: zeroAddress() },
      { fee: 0, recipient: zeroAddress() },
    ];

    await usdcVariableDebtToken.approveDelegation(
      batchTransaction.address,
      borrowAmount
    );

    const userBalBefore = await rWeth.balanceOf(deployer.address);
    const usdcBalBefore = await usdc.balanceOf(deployer.address);
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

    const userBalAfter = await rWeth.balanceOf(deployer.address);
    const usdcBalAfter = await usdc.balanceOf(deployer.address);

    expect(userBalBefore).eq(0);
    expect(userBalAfter).gt(0);
    expect(usdcBalBefore).eq(0);
    expect(usdcBalAfter).eq(borrowAmount);
  });
});
