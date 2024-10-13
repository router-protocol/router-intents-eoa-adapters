import hardhat, { ethers, waffle } from "hardhat";
import { expect } from "chai";
import { defaultAbiCoder } from "ethers/lib/utils";
import { RPC } from "../constants";
import { DEXSPAN, DEFAULT_ENV } from "../../tasks/constants";
import { BaseNameRegistryHelpers__factory } from "../../typechain/factories/BaseNameRegistryHelpers__factory";
import { TokenInterface__factory } from "../../typechain/factories/TokenInterface__factory";
import { MockAssetForwarder__factory } from "../../typechain/factories/MockAssetForwarder__factory";
import { BatchTransactionExternal__factory } from "../../typechain/factories/BatchTransactionExternal__factory";
import { IWETH__factory } from "../../typechain/factories/IWETH__factory";
import { BigNumber, Contract, Wallet } from "ethers";
import { getTransaction } from "../utils";
import { BASENAME_REGISTRY } from "../../tasks/deploy/basename-external/constants";
import { zeroAddress } from "ethereumjs-util";
import { MaxUint256 } from "@ethersproject/constants";
import { BaseResolverAbi } from "./BaseResolverAbi";
const { keccak256 } = ethers.utils;

const CHAIN_ID = "8453";
const USDC = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
const NATIVE_TOKEN = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const WNATIVE = "0x4200000000000000000000000000000000000006";
const USDC_WETH_POOL = "0xcDAC0d6c6C59727a65F871236188350531885C43";
describe("Base Name Adapter: ", async () => {
  const [deployer, alice] = waffle.provider.getWallets();

  const setupTests = async () => {
    let env = process.env.ENV;
    if (!env) env = DEFAULT_ENV;
    const MockAssetForwarder = await ethers.getContractFactory(
      "MockAssetForwarder"
    );
    const mockAssetForwarder = await MockAssetForwarder.deploy();

    const BatchTransactionExternal = await ethers.getContractFactory(
      "BatchTransactionExternal"
    );

    const batchTransaction = await BatchTransactionExternal.deploy(
      NATIVE_TOKEN,
      WNATIVE,
      mockAssetForwarder.address,
      DEXSPAN[env][CHAIN_ID],
      zeroAddress()
    );

    const BaseNameRegistryAdapter = await ethers.getContractFactory(
      "BaseNameRegistry"
    );
    const baseNameRegistryAdapter = await BaseNameRegistryAdapter.deploy(
      NATIVE_TOKEN,
      WNATIVE,
      BASENAME_REGISTRY[CHAIN_ID]
    );
    const MockToken = await ethers.getContractFactory("MockToken");
    const mockToken = await MockToken.deploy();
    await mockToken.mint(deployer.address, ethers.utils.parseEther("10000"));

    const usdc_weth_pool = TokenInterface__factory.connect(
      USDC_WETH_POOL,
      deployer
    );

    return {
      batchTransaction: BatchTransactionExternal__factory.connect(
        batchTransaction.address,
        deployer
      ),
      baseNameRegistryAdapter: BaseNameRegistryHelpers__factory.connect(
        baseNameRegistryAdapter.address,
        deployer
      ),
      mockToken: TokenInterface__factory.connect(mockToken.address, deployer),
      mockAssetForwarder: MockAssetForwarder__factory.connect(
        mockAssetForwarder.address,
        deployer
      ),
      usdc: TokenInterface__factory.connect(USDC, deployer),
      wnative: IWETH__factory.connect(WNATIVE, deployer),
      usdc_weth_pool,
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

  it("Can registred a new name on Base name Registry with native token", async () => {
    const { batchTransaction, baseNameRegistryAdapter, usdc, wnative } =
      await setupTests();

    await wnative.deposit({ value: ethers.utils.parseEther("0.1") });
    // await setUserTokenBalance(usdc, deployer, ethers.utils.parseEther("1"));

    expect(await usdc.balanceOf(deployer.address)).gt(0);
    const amount = 1000000000000000;
    const duration = 31536000;
    const name = "ateet";
    const resolver = "0xC6d566A56A1aFf6508b41f6c90ff131615583BCD";

    const contractAddress = "0xC6d566A56A1aFf6508b41f6c90ff131615583BCD";
    const contract = new ethers.Contract(
      contractAddress,
      BaseResolverAbi,
      waffle.provider
    );
    const rootnode =
      0xff1e3c0eb00ec714e34b6114125fbde1dea2f24a72fbf672e7b7fd5690328e10n;
    // const nodehash = keccak256(ethers.encodePacked(rootNode, keccak256(bytes(request.name))));
    const nodehash = keccak256(
      ethers.utils.defaultAbiCoder.encode(
        ["bytes32", "bytes32"],
        [rootnode, keccak256(ethers.utils.toUtf8Bytes(name))]
      )
    );

    const setAddrData = contract.interface.encodeFunctionData("setAddr", [
      nodehash,
      deployer,
    ]);
    const setNameData = contract.interface.encodeFunctionData("setName", [
      nodehash,
      name,
    ]);

    const registerRequest = {
      name: name,
      owner: deployer, // replace with actual owner address
      duration: duration, // registration duration in seconds
      resolver: resolver, // replace with actual resolver address
      data: [setAddrData, setNameData], // replace with actual resolver data bytes
      reverseRecord: true, // set as primary name
    };

    const registerEncode = defaultAbiCoder.encode(
      ["string", "address", "uint256", "address", "bytes[]", "bool"], // Types for RegisterRequest
      [
        registerRequest.name,
        registerRequest.owner,
        registerRequest.duration,
        registerRequest.resolver,
        registerRequest.data,
        registerRequest.reverseRecord,
      ]
    );

    const tokens = [NATIVE_TOKEN];
    const amounts = [amount];

    await batchTransaction.executeBatchCallsSameChain(
      0,
      tokens,
      amounts,
      [baseNameRegistryAdapter.address],
      [0],
      [2],
      [registerEncode]
    );
    expect(true).gt(true);
  });
});
