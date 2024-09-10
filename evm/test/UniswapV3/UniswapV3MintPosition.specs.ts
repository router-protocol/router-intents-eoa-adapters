import hardhat, { ethers, waffle } from "hardhat";
import { expect } from "chai";
import { defaultAbiCoder } from "ethers/lib/utils";
import { RPC } from "../constants";
import { DEXSPAN, DEFAULT_ENV } from "../../tasks/constants";
import { UniswapV3Mint__factory } from "../../typechain/factories/UniswapV3Mint__factory";
import { TokenInterface__factory } from "../../typechain/factories/TokenInterface__factory";
import { MockAssetForwarder__factory } from "../../typechain/factories/MockAssetForwarder__factory";
import { BatchTransaction__factory } from "../../typechain/factories/BatchTransaction__factory";
import { IWETH__factory } from "../../typechain/factories/IWETH__factory";
import { IUniswapV3NonfungiblePositionManager__factory } from "../../typechain/factories/IUniswapV3NonfungiblePositionManager__factory";
import { BigNumber, Contract, Wallet } from "ethers";
import { getUniswapV3Data } from "./utils";
import { decodeExecutionEvent } from "../utils";
import { zeroAddress } from "ethereumjs-util";

const CHAIN_ID = "5";
const UNISWAP_V3_POSITION_MANAGER =
  "0xC36442b4a4522E871399CD717aBDD847Ab11FE88";
const USDT = "0x2227E4764be4c858E534405019488D9E5890Ff9E";
const NATIVE_TOKEN = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const WNATIVE = "0xB4FBF271143F4FBf7B91A5ded31805e42b2208d6";

describe("UniswapV3Mint Adapter: ", async () => {
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

    const UniswapV3MintPositionAdapter = await ethers.getContractFactory(
      "UniswapV3Mint"
    );
    const uniswapV3MintPositionAdapter =
      await UniswapV3MintPositionAdapter.deploy(
        NATIVE_TOKEN,
        WNATIVE,
        UNISWAP_V3_POSITION_MANAGER
      );

    await batchTransaction.setAdapterWhitelist(
      [uniswapV3MintPositionAdapter.address],
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
      uniswapV3MintPositionAdapter: UniswapV3Mint__factory.connect(
        uniswapV3MintPositionAdapter.address,
        deployer
      ),
      mockToken: TokenInterface__factory.connect(mockToken.address, deployer),
      mockAssetForwarder: MockAssetForwarder__factory.connect(
        mockAssetForwarder.address,
        deployer
      ),
      usdt: TokenInterface__factory.connect(USDT, deployer),
      wnative: IWETH__factory.connect(WNATIVE, deployer),
      positionManager: IUniswapV3NonfungiblePositionManager__factory.connect(
        UNISWAP_V3_POSITION_MANAGER,
        deployer
      ),
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

  it("Can mint a new position on Uniswap", async () => {
    const {
      batchTransaction,
      uniswapV3MintPositionAdapter,
      positionManager,
      usdt,
      wnative,
    } = await setupTests();

    await wnative.deposit({ value: ethers.utils.parseEther("10") });
    await setUserTokenBalance(usdt, deployer, ethers.utils.parseEther("10"));

    const user = deployer;
    const chainId = CHAIN_ID;
    const token0 = wnative.address;
    const token1 = usdt.address;
    const amount0 = ethers.utils.parseEther("0.1").toString();
    const amount1 = "1000000000".toString();
    const fee = 3000;

    const mintParams = await getUniswapV3Data({
      user,
      chainId,
      token0,
      token1,
      amount0,
      amount1,
      fee,
    });

    const mintParamsIface =
      "tuple(address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint256 amount0Desired, uint256 amount1Desired, uint256 amount0Min, uint256 amount1Min, address recipient, uint256 deadline) MintParams";

    const uniswapData = defaultAbiCoder.encode([mintParamsIface], [mintParams]);

    const tokens = [mintParams.token0, mintParams.token1];
    const amounts = [mintParams.amount0Desired, mintParams.amount1Desired];
    const feeInfo = [
      { fee: 0, recipient: zeroAddress() },
      { fee: 0, recipient: zeroAddress() },
    ];

    if (mintParams.token0 === wnative.address) {
      await wnative.approve(
        batchTransaction.address,
        mintParams.amount0Desired
      );
      await usdt.approve(batchTransaction.address, mintParams.amount1Desired);
    } else {
      await usdt.approve(batchTransaction.address, mintParams.amount0Desired);
      await wnative.approve(
        batchTransaction.address,
        mintParams.amount1Desired
      );
    }

    const tx = await batchTransaction.executeBatchCallsSameChain(
      0,
      tokens,
      amounts,
      "",
      [uniswapV3MintPositionAdapter.address],
      [0],
      [2],
      [uniswapData]
    );
    const txReceipt = await tx.wait();

    const { data: uniswapExecutionEventData } = decodeExecutionEvent(txReceipt);

    const uniswapEventData = defaultAbiCoder.decode(
      [mintParamsIface, "uint256"],
      uniswapExecutionEventData
    );

    const position = await positionManager.positions(uniswapEventData[1]);
    expect(position.token0).eq(mintParams.token0);
    expect(position.token1).eq(mintParams.token1);
    expect(position.fee).eq(mintParams.fee);
  });
});
