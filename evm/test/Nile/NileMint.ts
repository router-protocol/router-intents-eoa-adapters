import hardhat, { ethers, waffle } from "hardhat";
import { expect } from "chai";
import { defaultAbiCoder } from "ethers/lib/utils";
import { RPC } from "../constants";
import { DEXSPAN, DEFAULT_ENV } from "../../tasks/constants";
import { NileMint__factory } from "../../typechain/factories/NileMint__factory";
import { TokenInterface__factory } from "../../typechain/factories/TokenInterface__factory";
import { MockAssetForwarder__factory } from "../../typechain/factories/MockAssetForwarder__factory";
import { BatchTransaction__factory } from "../../typechain/factories/BatchTransaction__factory";
import { IWETH__factory } from "../../typechain/factories/IWETH__factory";
import { INileNonFungiblePositionManager__factory } from "../../typechain/factories/INileNonFungiblePositionManager__factory";
import { BigNumber, Contract, Wallet } from "ethers";
import { getNileMintData } from "./utils";
import { decodeExecutionEvent, getTransaction } from "../utils";


const NILE_POSITION_MANAGER =
  "0xAAA78E8C4241990B4ce159E105dA08129345946A";
const CHAIN_ID = "59144";
const USDC = "0x176211869cA2b568f2A7D4EE941E073a821EE1ff";
const NATIVE_TOKEN = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const WNATIVE = "0xe5D7C2a44FfDDf6b295A15c148167daaAf5Cf34f";

describe("NileMint Adapter: ", async () => {
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
      DEXSPAN[env][CHAIN_ID]
    );

    const NileMintPositionAdapterContract = await ethers.getContractFactory(
      "NileMint"
    );
    const NileMintPositionAdapter =
      await NileMintPositionAdapterContract.deploy(
        NATIVE_TOKEN,
        WNATIVE,
        NILE_POSITION_MANAGER
      );

    await batchTransaction.setAdapterWhitelist(
      [NileMintPositionAdapter.address],
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
      NileMintPositionAdapter: NileMint__factory.connect(
        NileMintPositionAdapter.address,
        deployer
      ),
      mockToken: TokenInterface__factory.connect(mockToken.address, deployer),
      mockAssetForwarder: MockAssetForwarder__factory.connect(
        mockAssetForwarder.address,
        deployer
      ),
      wnative: IWETH__factory.connect(WNATIVE, deployer),
      positionManager: INileNonFungiblePositionManager__factory.connect(
        NILE_POSITION_MANAGER, 
        deployer
      ),
      usdc: TokenInterface__factory.connect(USDC, deployer),
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

  it("Can mint a new position on Nile", async () => {
    const {
      batchTransaction,
      NileMintPositionAdapter,
      positionManager,
      usdc,
      wnative,
      // swapRouter,
    } = await setupTests();

    await wnative.deposit({ value: ethers.utils.parseEther("10") });
    // await setUserTokenBalance(usdt, deployer, ethers.utils.parseEther("1000"));

    const txn = await getTransaction({
      fromTokenAddress: NATIVE_TOKEN,
      toTokenAddress: USDC,
      amount: ethers.utils.parseEther("0.2").toString(),
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

    const usdcBal = await usdc.balanceOf(deployer.address);
    expect(usdcBal).gt(0);

    const user = deployer;
    const chainId = CHAIN_ID;
    const token1 = wnative.address;
    const token0 = usdc.address;
    const amount1 = ethers.utils.parseEther("0.1").toString();
    const amount0 = usdcBal.toString();
    const fee = 3000;

    const mintParams = await getNileMintData({
      user,
      chainId,
      token0,
      token1,
      amount0,
      amount1,
      fee
    });

    const mintParamsIface =
      "tuple(address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint256 amount0Desired, uint256 amount1Desired, uint256 amount0Min, uint256 amount1Min, address recipient, uint256 deadline, uint256 veNFTTokenId) MintParams";

    const NileMintData = defaultAbiCoder.encode(
      [mintParamsIface],
      [mintParams]
    );

    const tokens = [mintParams.token0, mintParams.token1];
    const amounts = [mintParams.amount0Desired, mintParams.amount1Desired];

    if (mintParams.token0 === wnative.address) {
      await wnative.approve(
        batchTransaction.address,
        mintParams.amount0Desired
      );
      await usdc.approve(batchTransaction.address, mintParams.amount1Desired);
    } else {
      await usdc.approve(batchTransaction.address, mintParams.amount0Desired);
      await wnative.approve(
        batchTransaction.address,
        mintParams.amount1Desired
      );
    }
    const tx = await batchTransaction.executeBatchCallsSameChain(
      0,
      tokens,
      amounts,
      [NileMintPositionAdapter.address],
      [0],
      [2],
      [NileMintData]
    );
    const txReceipt = await tx.wait();

    const { data: NileExecutionEventData } =
      decodeExecutionEvent(txReceipt);

    const NileEventData = defaultAbiCoder.decode(
      [mintParamsIface, "uint256"],
      NileExecutionEventData
    );

    const position = await positionManager.positions(NileEventData[1]);
    expect(position.token0).eq(mintParams.token0);
    expect(position.token1).eq(mintParams.token1);
    expect(position.fee).eq(mintParams.fee);
  });
});
