import { HardhatRuntimeEnvironment, TaskArguments } from "hardhat/types";
import { task } from "hardhat/config";
import {
  ContractType,
  IDeployment,
  IDeploymentAdapters,
  getDeployments,
} from "../utils";
import {
  CONTRACT_NAME,
  DEFAULT_ENV,
  SET_ADAPTERS_ON_BATCH_TX,
} from "../constants";
import { BatchTransaction__factory } from "../../typechain/factories/BatchTransaction__factory";

const contractName = CONTRACT_NAME.BatchTransaction;

task(SET_ADAPTERS_ON_BATCH_TX).setAction(async function (
  _taskArguments: TaskArguments,
  _hre: HardhatRuntimeEnvironment
) {
  let env = process.env.ENV;
  if (!env) env = DEFAULT_ENV;

  const network = await _hre.getChainId();

  console.log(
    `Setting Adapters on ${contractName} Contract on chainId ${network}....`
  );

  const deployment = getDeployments(ContractType.None) as IDeployment;

  const instance = BatchTransaction__factory.connect(
    deployment[env][network][contractName],
    _hre.ethers.provider.getSigner()
  );

  const adapters = [];
  const shouldWhitelist = [];
  let len = 0;

  const swapDeployments = getDeployments(
    ContractType.Swap
  ) as IDeploymentAdapters;
  if (swapDeployments[env] && swapDeployments[env][network]) {
    len = swapDeployments[env][network].length;
    for (let i = 0; i < len; i++) {
      shouldWhitelist.push(true);
      adapters.push(swapDeployments[env][network][i].address);
    }
  }

  console.log(`Setting swap Adapters on ${contractName} complete`);

  const lpDeployments = getDeployments(ContractType.LP) as IDeploymentAdapters;

  if (lpDeployments[env] && lpDeployments[env][network]) {
    len = lpDeployments[env][network].length;
    for (let i = 0; i < len; i++) {
      shouldWhitelist.push(true);
      adapters.push(lpDeployments[env][network][i].address);
    }
  }

  console.log(`Setting lp Adapters on ${contractName} complete`);

  const liquidStakingDeployments = getDeployments(
    ContractType.LiquidStaking
  ) as IDeploymentAdapters;

  if (liquidStakingDeployments[env] && liquidStakingDeployments[env][network]) {
    len = liquidStakingDeployments[env][network].length;
    for (let i = 0; i < len; i++) {
      shouldWhitelist.push(true);
      adapters.push(liquidStakingDeployments[env][network][i].address);
    }
  }

  console.log(`Setting liquid staking Adapters on ${contractName} complete`);

  const stakingDeployments = getDeployments(
    ContractType.Staking
  ) as IDeploymentAdapters;

  if (stakingDeployments[env] && stakingDeployments[env][network]) {
    len = stakingDeployments[env][network].length;
    for (let i = 0; i < len; i++) {
      shouldWhitelist.push(true);
      adapters.push(stakingDeployments[env][network][i].address);
    }
  }

  console.log(`Setting staking Adapters on ${contractName} complete`);

  const lendingBorrowingDeployments = getDeployments(
    ContractType.LendingBorrowing
  ) as IDeploymentAdapters;

  if (
    lendingBorrowingDeployments[env] &&
    lendingBorrowingDeployments[env][network]
  ) {
    len = lendingBorrowingDeployments[env][network].length;
    for (let i = 0; i < len; i++) {
      shouldWhitelist.push(true);
      adapters.push(lendingBorrowingDeployments[env][network][i].address);
    }
  }

  const bridgeDeployments = getDeployments(
    ContractType.Bridge
  ) as IDeploymentAdapters;

  if (bridgeDeployments[env] && bridgeDeployments[env][network]) {
    len = bridgeDeployments[env][network].length;
    for (let i = 0; i < len; i++) {
      shouldWhitelist.push(true);
      adapters.push(bridgeDeployments[env][network][i].address);
    }
  }
  console.log(`Setting Bridge Adapters on ${contractName} complete`);

  const perpDeployments = getDeployments(
    ContractType.Perpetuals
  ) as IDeploymentAdapters;

  if (perpDeployments[env] && perpDeployments[env][network]) {
    len = perpDeployments[env][network].length;
    for (let i = 0; i < len; i++) {
      shouldWhitelist.push(true);
      adapters.push(perpDeployments[env][network][i].address);
    }
  }
  console.log(`Setting Perp Adapters on ${contractName} complete`);

  const fpaDeployments = getDeployments(
    ContractType.FPA
  ) as IDeploymentAdapters;

  if (fpaDeployments[env] && fpaDeployments[env][network]) {
    len = fpaDeployments[env][network].length;
    for (let i = 0; i < len; i++) {
      shouldWhitelist.push(true);
      adapters.push(fpaDeployments[env][network][i].address);
    }
  }
  console.log(`Setting FPA Adapters on ${contractName} complete`);

  const feeDeployments = getDeployments(
    ContractType.Fee
  ) as IDeploymentAdapters;

  if (feeDeployments[env] && feeDeployments[env][network]) {
    len = feeDeployments[env][network].length;
    for (let i = 0; i < len; i++) {
      shouldWhitelist.push(true);
      adapters.push(feeDeployments[env][network][i].address);
    }
  }
  console.log(`Setting Fee Adapters on ${contractName} complete`);

  if (adapters.length === 0) {
    console.log("Adapters length zero: ", adapters);
    return;
  }

  const tx = await instance.setAdapterWhitelist(adapters, shouldWhitelist);
  await tx.wait(1);

  console.log("tx hash: ", tx.hash);
});
