import hardhat, { ethers, waffle } from "hardhat";
import { expect } from "chai";
import { defaultAbiCoder } from "ethers/lib/utils";
import { RPC } from "../constants";
import { DEXSPAN, DEFAULT_ENV } from "../../tasks/constants";
import { InitOpenPosition__factory } from "../../typechain/factories/InitOpenPosition__factory";
import { TokenInterface__factory } from "../../typechain/factories/TokenInterface__factory";
import { MockAssetForwarder__factory } from "../../typechain/factories/MockAssetForwarder__factory";
import { BatchTransaction__factory } from "../../typechain/factories/BatchTransaction__factory";
import { IWETH__factory } from "../../typechain/factories/IWETH__factory";
import { ILoopingHookUniversalRouter__factory } from "../../typechain/factories/ILoopingHookUniversalRouter__factory";
import { BigNumber, Contract, Wallet } from "ethers";
import { decodeExecutionEvent, getTransaction } from "../utils";
import { zeroAddress } from "ethereumjs-util";
const CHAIN_ID = "5000";
const FEE_WALLET = "0x00EB64b501613F8Cf8Ef3Ac4F82Fc63a50343fee";
const UNIVERSAL_ROUTER = "0x7fa704E73262e5A9f48382087F69C6Aba0408eAA";
const METH = "0xcDA86A272531e8640cD7F1a92c01839911B90bb0";
const NATIVE_TOKEN = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
const WNATIVE = "0x78c1b0C915c4FAA5FffA6CAbf0219DA63d7f4cb8";

describe("InitOpenPosition Adapter: ", async () => {
  const [deployer] = waffle.provider.getWallets();

  const setupTests = async () => {
    let env = process.env.ENV;
    if (!env) env = DEFAULT_ENV;

    const MockAssetForwarder = await ethers.getContractFactory(
      "MockAssetForwarder"
    );
    const mockAssetForwarder = await MockAssetForwarder.deploy();

    const FeeAdapter = await ethers.getContractFactory("FeeAdapter");
    const feeAdapter = await FeeAdapter.deploy(
      NATIVE_TOKEN,
      WNATIVE,
      FEE_WALLET,
      5
    );

    const BatchTransaction = await ethers.getContractFactory(
      "BatchTransaction"
    );

    const batchTransaction = await BatchTransaction.deploy(
      NATIVE_TOKEN,
      WNATIVE,
      mockAssetForwarder.address,
      DEXSPAN[env][CHAIN_ID],
      zeroAddress(),
      feeAdapter.address
    );

    const InitOpenPositionAdapter = await ethers.getContractFactory(
      "InitOpenPosition"
    );
    const initOpenPositionAdapter = await InitOpenPositionAdapter.deploy(
      NATIVE_TOKEN,
      WNATIVE,
      UNIVERSAL_ROUTER
    );

    await batchTransaction.setAdapterWhitelist(
      [initOpenPositionAdapter.address, feeAdapter.address],
      [true, true]
    );

    const MockToken = await ethers.getContractFactory("MockToken");
    const mockToken = await MockToken.deploy();
    await mockToken.mint(deployer.address, ethers.utils.parseEther("10000"));

    const FeeDataStoreAddress = await feeAdapter.feeDataStore();

    const FeeDataStoreContract = await ethers.getContractFactory(
      "FeeDataStore"
    );
    const feeDataStoreInstance =
      FeeDataStoreContract.attach(FeeDataStoreAddress);

    await feeDataStoreInstance.updateFeeWalletForAppId(
      [1],
      ["0xBec33ce33afdAF5604CCDF2c4b575238C5FBD23d"]
    );

    return {
      batchTransaction: BatchTransaction__factory.connect(
        batchTransaction.address,
        deployer
      ),
      initOpenPositionAdapter: InitOpenPosition__factory.connect(
        initOpenPositionAdapter.address,
        deployer
      ),
      mockToken: TokenInterface__factory.connect(mockToken.address, deployer),
      mockAssetForwarder: MockAssetForwarder__factory.connect(
        mockAssetForwarder.address,
        deployer
      ),
      meth: TokenInterface__factory.connect(METH, deployer),
      wnative: IWETH__factory.connect(WNATIVE, deployer),
      positionManager: ILoopingHookUniversalRouter__factory.connect(
        UNIVERSAL_ROUTER,
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

  it("Can mint a new position on AGNI", async () => {
    const {
      batchTransaction,
      initOpenPositionAdapter,
      positionManager,
      wnative,
      meth,
    } = await setupTests();

    await wnative.deposit({ value: ethers.utils.parseEther("10") });

    const txn = await getTransaction({
      fromTokenAddress: NATIVE_TOKEN,
      toTokenAddress: METH,
      amount: ethers.utils.parseEther("100").toString(),
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

    const methBal = await meth.balanceOf(deployer.address);
    expect(methBal).gt(0);

    const user = deployer;
    const chainId = CHAIN_ID;
    const token0 = meth.address;
    const token1 = wnative.address;
    const amount0 = methBal.toString();
    const amount1 = ethers.utils.parseEther("0.1").toString();

    const unit256Max = ethers.BigNumber.from(
      "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"
    );

    const mintParams = {
      _mode: 4,
      _viewer: deployer.address,
      _tokenIn: METH,
      _amtIn: unit256Max,
      _borrPool: "0x51AB74f8B03F0305d8dcE936B473AB587911AEC4",
      _borrAmt: "4037874775008549",
      _collPool: "0x5071c003bB45e49110a905c1915EbdD2383A89dF",
      _data:
        "0x",
      _minAmtOut: "0",
    };

    const mintParamsIface =
      "tuple(uint16 _mode, address _viewer, address _tokenIn, uint _amtIn, address _borrPool, uint _borrAmt, address _collPool, bytes _data, uint _minAmtOut ) MintParams";

    const initData = defaultAbiCoder.encode([mintParamsIface], [mintParams]);

    const tokens = [mintParams._tokenIn];
    const amounts = ["4336886900000000"];
    await meth.approve(batchTransaction.address, mintParams._amtIn);

    const appId = ["1"];
    const fee = ["0"];

    const feeData = defaultAbiCoder.encode(
      ["uint256[]", "uint96[]", "address[]", "uint256[]", "bool"],
      [appId, fee, tokens, amounts, true]
    );

    const targets = [initOpenPositionAdapter.address];
    const data = [initData];
    const value = [0];
    const callType = [2];

    const handlerBalancerBefore = await wnative.balanceOf(FEE_WALLET);

    const tx = await batchTransaction.executeBatchCallsSameChain(
      0,
      tokens,
      amounts,
      feeData,
      targets,
      value,
      callType,
      data,
      { gasLimit: 10000000 }
    );
    const txReceipt = await tx.wait();

    const handlerBalancerAfter = await wnative.balanceOf(FEE_WALLET);

    expect(handlerBalancerAfter).gt(handlerBalancerBefore);

    // const { data: scribeExecutionEventData } = decodeExecutionEvent(txReceipt);

    // const scribeEventData = defaultAbiCoder.decode(
    //   [mintParamsIface, "uint256"],
    //   scribeExecutionEventData
    // );

    // const position = await positionManager.positions(scribeEventData[1]);
    // expect(position.token0.toLowerCase()).eq(mintParams.token0);
    // expect(position.token1.toLowerCase()).eq(mintParams.token1);
  });
});
