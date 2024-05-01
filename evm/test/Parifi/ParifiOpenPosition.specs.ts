import hardhat, { ethers, waffle } from "hardhat";
import { expect } from "chai";
import { RPC } from "../constants";
import { DEFAULT_ENV, DEXSPAN, NATIVE } from "../../tasks/constants";
import { ParifiOpenPositionAdapter__factory } from "../../typechain/factories/ParifiOpenPositionAdapter__factory";
import { MockAssetForwarder__factory } from "../../typechain/factories/MockAssetForwarder__factory";
import { BatchTransaction__factory } from "../../typechain/factories/BatchTransaction__factory";
import {
  PARIFI_DATA_FABRIC,
  PARIFI_FORWARDER,
  PARIFI_ORDER_MANAGER,
} from "../../tasks/deploy/parifi/constants";
import { IWETH__factory } from "../../typechain/factories/IWETH__factory";
import { IParifiOrderManager__factory } from "../../typechain/factories/IParifiOrderManager__factory";
import { IParifiForwarder__factory } from "../../typechain/factories/IParifiForwarder__factory";
import { signPermitWithDomain } from "../utils";
import { MaxUint256 } from "@ethersproject/constants";

const CHAIN_ID = "42161";
const WETH_MARKET_ID =
  "0x93923ab9aed4a6afb7158a33964acdd1eb404765da059bea7aa7c631ccaffbe8";
const WETH = "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1";

describe("Parifi Open Position Adapter: ", async () => {
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
      WETH,
      mockAssetForwarder.address,
      DEXSPAN[env][CHAIN_ID]
    );

    const ParifiOpenPosition = await ethers.getContractFactory(
      "ParifiOpenPosition"
    );
    const parifiOpenPositionAdapter = await ParifiOpenPosition.deploy(
      NATIVE,
      WETH,
      PARIFI_ORDER_MANAGER[CHAIN_ID],
      PARIFI_DATA_FABRIC[CHAIN_ID],
      PARIFI_FORWARDER[CHAIN_ID]
    );

    await batchTransaction.setAdapterWhitelist(
      [parifiOpenPositionAdapter.address],
      [true]
    );

    return {
      batchTransaction: BatchTransaction__factory.connect(
        batchTransaction.address,
        deployer
      ),
      parifiOpenPositionAdapter: ParifiOpenPositionAdapter__factory.connect(
        parifiOpenPositionAdapter.address,
        deployer
      ),
      mockAssetForwarder: MockAssetForwarder__factory.connect(
        mockAssetForwarder.address,
        deployer
      ),
      weth: IWETH__factory.connect(WETH, deployer),
    };
  };

  beforeEach(async function () {
    await hardhat.network.provider.request({
      method: "hardhat_reset",
      params: [
        {
          forking: {
            jsonRpcUrl: RPC[CHAIN_ID],
            blockNumber: 199498164,
          },
        },
      ],
    });
  });

  it.only("Can open position on Parifi", async () => {
    const { batchTransaction, parifiOpenPositionAdapter, weth } =
      await setupTests();

    const amount = ethers.utils.parseEther("1");

    await weth.deposit({ value: amount });
    expect(await weth.balanceOf(deployer.address)).eq(amount);

    // const orderTuple =
    //   "tuple(bytes32 marketId, address userAddress, uint8 orderType, bool isLong, bool isLimitOrder, bool triggerAbove, uint256 deadline, uint256 deltaCollateral, uint256 deltaSize, uint256 expectedPrice, uint256 maxSlippage, address partnerAddress) Order";

    const txTuple =
      "tuple(address fromAddress, address toAddress, uint256 txValue, uint256 minGas, uint256 maxGasPrice, uint256 userNonce, uint256 txDeadline, bytes txData) Transaction";

    const permitParamsTuple =
      "tuple(uint256 deadline, bytes32 r, bytes32 s, uint8 v) PermitParams";
    const order = {
      marketId: WETH_MARKET_ID,
      userAddress: deployer.address,
      orderType: 0, // OPEN_NEW_POSITION
      isLong: true,
      isLimitOrder: false,
      triggerAbove: false,
      deadline: "0",
      deltaCollateral: amount.toString(),
      deltaSize: ethers.utils.parseEther("0.2").toString(),
      expectedPrice: 0,
      maxSlippage: "200",
      partnerAddress: ethers.constants.AddressZero,
    };

    const txData =
      IParifiOrderManager__factory.createInterface().encodeFunctionData(
        "createNewPosition",
        [order]
      );

    const eip712Abi = [
      "function eip712Domain() external view returns (bytes1 fields, string memory name, string memory version, uint256 chainId, address verifyingContract, bytes32 salt, uint256[] memory extensions)",
      "function nonces(address owner) external view returns (uint256)",
    ];
    const parifiForwarder = new ethers.Contract(
      PARIFI_FORWARDER[CHAIN_ID],
      eip712Abi,
      ethers.provider
    );

    const wethNonces = new ethers.Contract(weth.address, eip712Abi, deployer);
    const nonce = await wethNonces.nonces(deployer.address);

    const permitDomain = {
      name: "Wrapped Ether",
      version: "1",
      chainId: CHAIN_ID,
      verifyingContract: weth.address,
    };

    const permitDeadline = MaxUint256.toString();
    const values = {
      owner: deployer.address,
      spender: PARIFI_ORDER_MANAGER[CHAIN_ID],
      value: order.deltaCollateral,
      nonce: nonce.toString(),
      deadline: permitDeadline,
    };

    const { v, r, s } = await signPermitWithDomain(
      deployer,
      permitDomain,
      values
    );

    const permitParams = {
      deadline: permitDeadline,
      r,
      s,
      v,
    };

    const permitIface = [
      "function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s) external",
    ];

    const wethPermit = new ethers.Contract(weth.address, permitIface, deployer);
    await wethPermit.permit(
      values.owner,
      values.spender,
      values.value,
      values.deadline,
      v,
      r,
      s
    );

    const domainRes = await parifiForwarder.eip712Domain();
    const domain = {
      name: domainRes[1].toString(),
      version: domainRes[2].toString(),
      chainId: domainRes[3].toString(),
      verifyingContract: domainRes[4].toString(),
    };

    const types = {
      Transaction: [
        { name: "fromAddress", type: "address" },
        { name: "toAddress", type: "address" },
        { name: "txValue", type: "uint256" },
        { name: "minGas", type: "uint256" },
        { name: "maxGasPrice", type: "uint256" },
        { name: "userNonce", type: "uint256" },
        { name: "txDeadline", type: "uint256" },
        { name: "txData", type: "bytes" },
      ],
    };

    const transaction = {
      fromAddress: deployer.address,
      toAddress: PARIFI_ORDER_MANAGER[CHAIN_ID],
      txValue: 0,
      minGas: "100000",
      maxGasPrice: "2000000000",
      userNonce: 0,
      txDeadline: MaxUint256.toString(),
      txData,
    };

    const signature = await deployer._signTypedData(domain, types, transaction);

    const parifiData = ethers.utils.defaultAbiCoder.encode(
      [txTuple, permitParamsTuple, "bytes"],
      [transaction, permitParams, signature]
    );

    await weth.approve(batchTransaction.address, amount);

    const tokens = [WETH];
    const amounts = [amount];
    const targets = [parifiOpenPositionAdapter.address];
    const data = [parifiData];
    const value = [0];
    const callType = [2];

    const orderManager = IParifiOrderManager__factory.connect(
      PARIFI_ORDER_MANAGER[CHAIN_ID],
      deployer
    );

    // Next orderId for user
    const orderId = await orderManager.getOrderIdForUser(deployer.address);

    await batchTransaction.executeBatchCallsSameChain(
      0,
      tokens,
      amounts,
      targets,
      value,
      callType,
      data
    );

    const orderDetails = await orderManager.getPendingOrder(orderId);
    expect(orderDetails[0]).eq(WETH_MARKET_ID);
  });
});
