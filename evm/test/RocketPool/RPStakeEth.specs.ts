// import hardhat, { ethers, waffle } from "hardhat";
// import { expect } from "chai";
// import { RPC } from "../constants";
// import { DEXSPAN, DEFAULT_ENV, NATIVE, WNATIVE } from "../../tasks/constants";
// import { RPStakeEth__factory } from "../../typechain/factories/RPStakeEth__factory";
// import { TokenInterface__factory } from "../../typechain/factories/TokenInterface__factory";
// import { MockAssetForwarder__factory } from "../../typechain/factories/MockAssetForwarder__factory";
// import { BatchTransaction__factory } from "../../typechain/factories/BatchTransaction__factory";
// import { getPathfinderData } from "../utils";
// import { defaultAbiCoder } from "ethers/lib/utils";
// import { DexSpanAdapter__factory } from "../../typechain/factories/DexSpanAdapter__factory";
// import { zeroAddress } from "ethereumjs-util";

// const CHAIN_ID = "5";
// const R_ETH_TOKEN = "0x178E141a0E3b34152f73Ff610437A7bf9B83267A";
// const ROCKET_DEPOSIT_POOL = "0xa9A6A14A3643690D0286574976F45abBDAD8f505";
// const NATIVE_TOKEN = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
// const USDT = "0x2227E4764be4c858E534405019488D9E5890Ff9E";

// describe("RPStakeEth Adapter: ", async () => {
//   const [deployer] = waffle.provider.getWallets();

//   const setupTests = async () => {
//     let env = process.env.ENV;
//     if (!env) env = DEFAULT_ENV;
//     const MockAssetForwarder = await ethers.getContractFactory(
//       "MockAssetForwarder"
//     );
//     const mockAssetForwarder = await MockAssetForwarder.deploy();

//     const BatchTransaction = await ethers.getContractFactory(
//       "BatchTransaction"
//     );

//     const batchTransaction = await BatchTransaction.deploy(
//       NATIVE,
//       WNATIVE[env][CHAIN_ID],
//       mockAssetForwarder.address,
//       DEXSPAN[env][CHAIN_ID],
//       zeroAddress()
//     );

//     const DexSpanAdapter = await ethers.getContractFactory("DexSpanAdapter");
//     const dexSpanAdapter = await DexSpanAdapter.deploy(
//       NATIVE,
//       WNATIVE[env][CHAIN_ID],
//       DEXSPAN[env][CHAIN_ID]
//     );

//     const RPStakeEth = await ethers.getContractFactory("RPStakeEth");
//     const rpStakeEthAdapter = await RPStakeEth.deploy(
//       NATIVE,
//       WNATIVE[env][CHAIN_ID],
//       R_ETH_TOKEN,
//       ROCKET_DEPOSIT_POOL
//     );

//     await batchTransaction.setAdapterWhitelist(
//       [dexSpanAdapter.address, rpStakeEthAdapter.address],
//       [true, true]
//     );

//     return {
//       batchTransaction: BatchTransaction__factory.connect(
//         batchTransaction.address,
//         deployer
//       ),
//       rpStakeEthAdapter: RPStakeEth__factory.connect(
//         rpStakeEthAdapter.address,
//         deployer
//       ),
//       dexSpanAdapter: DexSpanAdapter__factory.connect(
//         dexSpanAdapter.address,
//         deployer
//       ),
//       mockAssetForwarder: MockAssetForwarder__factory.connect(
//         mockAssetForwarder.address,
//         deployer
//       ),
//       usdt: TokenInterface__factory.connect(USDT, deployer),
//       rpEth: TokenInterface__factory.connect(R_ETH_TOKEN, deployer),
//     };
//   };

//   beforeEach(async function () {
//     await hardhat.network.provider.request({
//       method: "hardhat_reset",
//       params: [
//         {
//           forking: {
//             jsonRpcUrl: RPC[CHAIN_ID],
//           },
//         },
//       ],
//     });
//   });

//   it("Can stake on rp on same chain", async () => {
//     const { batchTransaction, dexSpanAdapter, rpEth } = await setupTests();

//     const amount = "1000000000000000000";

//     const { data: swapData } = await getPathfinderData(
//       NATIVE_TOKEN,
//       R_ETH_TOKEN,
//       amount,
//       CHAIN_ID,
//       CHAIN_ID,
//       batchTransaction.address
//     );

//     const tokens = [NATIVE_TOKEN];
//     const amounts = [amount];
//     const targets = [dexSpanAdapter.address];
//     const data = [swapData];
//     const value = [0];
//     const callType = [2];
//     const feeInfo = [{ fee: 0, recipient: zeroAddress() }];

//     const balBefore = await ethers.provider.getBalance(deployer.address);
//     const rpEthBalBefore = await rpEth.balanceOf(deployer.address);

//     await batchTransaction.executeBatchCallsSameChain(
//       0,
//       tokens,
//       amounts,
//       feeInfo,
//       targets,
//       value,
//       callType,
//       data,
//       { value: amount, gasLimit: 10000000 }
//     );

//     const balAfter = await ethers.provider.getBalance(deployer.address);
//     const rpEthBalAfter = await rpEth.balanceOf(deployer.address);

//     expect(balBefore).gt(balAfter);
//     expect(rpEthBalAfter).gt(rpEthBalBefore);
//   });

//   it("Can stake ETH on Rocket Pool on dest chain when instruction is received from BatchTransaction contract", async () => {
//     const { batchTransaction, dexSpanAdapter, rpEth, mockAssetForwarder } =
//       await setupTests();

//     const amount = "100000000000000000";

//     const { data: swapData } = await getPathfinderData(
//       NATIVE_TOKEN,
//       R_ETH_TOKEN,
//       amount,
//       CHAIN_ID,
//       CHAIN_ID,
//       batchTransaction.address
//     );

//     const targets = [dexSpanAdapter.address];
//     const data = [swapData];
//     const value = [0];
//     const callType = [2];

//     const assetForwarderData = defaultAbiCoder.encode(
//       ["uint256", "address", "address[]", "uint256[]", "uint256[]", "bytes[]"],
//       [0, deployer.address, targets, value, callType, data]
//     );

//     const balBefore = await ethers.provider.getBalance(deployer.address);
//     const rpEthBalBefore = await rpEth.balanceOf(deployer.address);

//     await mockAssetForwarder.handleMessage(
//       NATIVE_TOKEN,
//       amount,
//       assetForwarderData,
//       batchTransaction.address,
//       { value: amount }
//     );

//     const balAfter = await ethers.provider.getBalance(deployer.address);
//     const rpEthBalAfter = await rpEth.balanceOf(deployer.address);

//     expect(balAfter).lt(balBefore);
//     expect(rpEthBalAfter).gt(rpEthBalBefore);
//   });
// });
