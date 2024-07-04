import hardhat, { ethers, waffle } from "hardhat";
import { expect } from "chai";
import { defaultAbiCoder } from "ethers/lib/utils";
import { RPC } from "../constants";
import { DEXSPAN, DEFAULT_ENV } from "../../tasks/constants";
import { PendleMint__factory } from "../../typechain/factories/PendleMint__factory";
import { TokenInterface__factory } from "../../typechain/factories/TokenInterface__factory";
import { MockAssetForwarder__factory } from "../../typechain/factories/MockAssetForwarder__factory";
import { BatchTransaction__factory } from "../../typechain/factories/BatchTransaction__factory";
import { IWETH__factory } from "../../typechain/factories/IWETH__factory";
import { IPendleRouter__factory } from "../../typechain/factories/IPendleRouter__factory";
import { BigNumber, Contract, Wallet } from "ethers";
import { getTransaction } from "../utils";
import { PENDLE_ROUTER } from "../../tasks/deploy/pendle/constants";
import { zeroAddress } from "ethereumjs-util";

const CHAIN_ID = "1";
const NATIVE_TOKEN = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const WNATIVE = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
const PENDLE_MARKET = "0x4f43c77872Db6BA177c270986CD30c3381AF37Ee";
const RS_ETH_TOKEN = "0xA1290d69c65A6Fe4DF752f95823fae25cB99e5A7";
const PENDLE_TOKEN = "0x808507121B80c02388fAd14726482e061B8da827";

describe("PendleMint Adapter: ", async () => {
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
      WNATIVE,
      mockAssetForwarder.address,
      DEXSPAN[env][CHAIN_ID],
      zeroAddress()
    );

    const PendleMintPositionAdapter = await ethers.getContractFactory(
      "PendleMint"
    );
    const pendleMintPositionAdapter = await PendleMintPositionAdapter.deploy(
      NATIVE_TOKEN,
      WNATIVE,
      PENDLE_ROUTER[CHAIN_ID]
    );

    await batchTransaction.setAdapterWhitelist(
      [pendleMintPositionAdapter.address],
      [true]
    );

    const MockToken = await ethers.getContractFactory("MockToken");
    const mockToken = await MockToken.deploy();
    await mockToken.mint(deployer.address, ethers.utils.parseEther("10000"));

    return {
      batchTransaction: BatchTransaction__factory.connect(
        batchTransaction.address,
        deployer
      ),
      pendleMintPositionAdapter: PendleMint__factory.connect(
        pendleMintPositionAdapter.address,
        deployer
      ),
      mockToken: TokenInterface__factory.connect(mockToken.address, deployer),
      mockAssetForwarder: MockAssetForwarder__factory.connect(
        mockAssetForwarder.address,
        deployer
      ),
      wnative: IWETH__factory.connect(WNATIVE, deployer),
      rsEth: TokenInterface__factory.connect(RS_ETH_TOKEN, deployer),
      pendle: TokenInterface__factory.connect(PENDLE_TOKEN, deployer),
      pendleMarket: TokenInterface__factory.connect(PENDLE_MARKET, deployer),
      router: IPendleRouter__factory.connect(PENDLE_ROUTER[CHAIN_ID], deployer),
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

  const toBytes32 = (bn: BigNumber) => {
    return ethers.utils.hexlify(ethers.utils.zeroPad(bn.toHexString(), 32));
  };

  // This works for token when it has balance mapping at slot 0.
  const setUserTokenBalance = async (
    contract: Contract,
    user: Wallet,
    balance: BigNumber
  ) => {
    const index = ethers.utils.solidityKeccak256(
      ["uint256", "uint256"],
      [user.address, 0] // key, slot
    );

    await hardhat.network.provider.request({
      method: "hardhat_setStorageAt",
      params: [contract.address, index, toBytes32(balance).toString()],
    });

    await hardhat.network.provider.request({
      method: "evm_mine",
      params: [],
    });
  };

  it.only("Can mint a new position on Pendle", async () => {
    const {
      batchTransaction,
      pendleMintPositionAdapter,
      wnative,
      rsEth,
      pendle,
      pendleMarket,
    } = await setupTests();

    await wnative.deposit({ value: ethers.utils.parseEther("0.1") });
    // await setUserTokenBalance(usdc, deployer, ethers.utils.parseEther("1"));

    const txn = await getTransaction({
      fromTokenAddress: NATIVE_TOKEN,
      toTokenAddress: RS_ETH_TOKEN,
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

    const rsEthBal = await rsEth.balanceOf(deployer.address);

    expect(rsEthBal).gt(0);

    const SWAP_DATA = `tuple(uint8 swapType, address extRouter, bytes extCalldata, bool needScale)`;

    const ORDER = `tuple(uint256 salt, uint256 expiry, uint256 nonce, uint8 orderType, address token, address YT, address maker, address receiver, uint256 makingAmount, uint256 lnImpliedRate, uint256 failSafeRate, bytes permit)`;

    const FILL_ORDER_PARAMS = `tuple(${ORDER} order, bytes signature, uint256 makingAmount)`;

    const LIMIT_ORDER_DATA = `tuple(address limitRouter, uint256 epsSkipMarket, ${FILL_ORDER_PARAMS}[] normalFills, ${FILL_ORDER_PARAMS}[] flashFills, bytes optData)`;

    const TOKEN_INPUT = `tuple(address tokenIn, uint256 netTokenIn, address tokenMintSy, address pendleSwap, ${SWAP_DATA} swapData)`;

    const APPROX_PARAMS =
      "tuple(uint256 guessMin, uint256 guessMax, uint256 guessOffchain, uint256 maxIteration, uint256 eps)";

    const mintParamsIface = `tuple(address receiver, address market, uint256 minLpOut, ${APPROX_PARAMS} guessPtReceivedFromSy, ${TOKEN_INPUT} input, ${LIMIT_ORDER_DATA} limit) PendleSupplyData`;

    const user = deployer.address;
    const market = PENDLE_MARKET;
    const minLpOut = "0";

    const guessPtReceivedFromSy = {
      guessMin: 0, // adjust as desired
      guessMax: ethers.constants.MaxUint256, // adjust as desired
      guessOffchain: 0, // strictly 0
      maxIteration: 256, // adjust as desired
      eps: 1e14, // max 0.01% unused, adjust as desired
    };
    const tokenIn = rsEth.address;
    // const pendleSwap = "0xCad581ee99a06BfcA69D8880df96BcC2d0DE3F2E";
    const swapData = {
      swapType: "0",
      extRouter: ethers.constants.AddressZero,
      extCalldata: "0x",
      needScale: false,
    };
    const input = {
      tokenIn: tokenIn,
      netTokenIn: rsEthBal.toString(),
      tokenMintSy: tokenIn,
      pendleSwap: ethers.constants.AddressZero,
      swapData,
    };
    const limit = {
      limitRouter: "0x0000000000000000000000000000000000000000",
      epsSkipMarket: "0",
      normalFills: [],
      flashFills: [],
      optData: "0x",
    };

    const mintParams = {
      receiver: user,
      market: market,
      minLpOut: minLpOut,
      guessPtReceivedFromSy: guessPtReceivedFromSy,
      input: input,
      limit: limit,
    };

    enum SWAP_TYPE {
      NONE,
      KYBERSWAP,
      ONE_INCH,
      ETH_WETH,
    }

    enum ORDER_TYPE {
      SY_FOR_PT,
      PT_FOR_SY,
      SY_FOR_YT,
      YT_FOR_SY,
    }

    const pendleData = defaultAbiCoder.encode([mintParamsIface], [mintParams]);

    const tokens = [mintParams.input.tokenIn];
    const amounts = [mintParams.input.netTokenIn];
    const feeInfo = [{ fee: 0, recipient: zeroAddress() }];

    await rsEth.approve(batchTransaction.address, mintParams.input.netTokenIn);

    const lpBalBefore = await pendleMarket.balanceOf(deployer.address);

    await batchTransaction.executeBatchCallsSameChain(
      0,
      tokens,
      amounts,
      feeInfo,
      [pendleMintPositionAdapter.address],
      [0],
      [2],
      [pendleData]
    );

    const lpBalAfter = await pendleMarket.balanceOf(deployer.address);

    expect(lpBalAfter).gt(lpBalBefore);
  });
});
