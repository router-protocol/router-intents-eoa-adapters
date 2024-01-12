import { HardhatRuntimeEnvironment, TaskArguments } from "hardhat/types";
import {
  CONTRACT_NAME,
  DEFAULT_ENV,
  DEPLOY_AAVE_V3_SUPPLY_ADAPTER,
  NATIVE,
  VERIFY_AAVE_V3_SUPPLY_ADAPTER,
  WNATIVE,
} from "../../constants";
import { task } from "hardhat/config";
import {
  ContractType,
  IDeploymentAdapters,
  getDeployments,
  recordAllDeployments,
  saveDeployments,
} from "../../utils";
import {
  AAVE_V3_POOL,
  AAVE_V3_REFERRAL_CODE,
  AAVE_V3_WRAPPED_TOKEN_GATEWAY,
} from "./constants";

const contractName: string = CONTRACT_NAME.AaveV3Supply;
const contractType = ContractType.LendingBorrowing;

task(DEPLOY_AAVE_V3_SUPPLY_ADAPTER)
  .addFlag("verify", "pass true to verify the contract")
  .setAction(async function (
    _taskArguments: TaskArguments,
    _hre: HardhatRuntimeEnvironment
  ) {
    let env = process.env.ENV;
    if (!env) env = DEFAULT_ENV;

    const network = await _hre.getChainId();

    console.log(`Deploying ${contractName} Contract on chainId ${network}....`);
    const factory = await _hre.ethers.getContractFactory(contractName);
    const instance = await factory.deploy(
      NATIVE,
      WNATIVE[env][network],
      AAVE_V3_POOL[network],
      AAVE_V3_WRAPPED_TOKEN_GATEWAY[network],
      AAVE_V3_REFERRAL_CODE
    );
    await instance.deployed();

    const deployment = await recordAllDeployments(
      env,
      network,
      contractType,
      contractName,
      instance.address
    );

    await saveDeployments(contractType, deployment);

    console.log(`${contractName} contract deployed at`, instance.address);

    if (_taskArguments.verify === true) {
      await _hre.run(VERIFY_AAVE_V3_SUPPLY_ADAPTER);
    }
  });

task(VERIFY_AAVE_V3_SUPPLY_ADAPTER).setAction(async function (
  _taskArguments: TaskArguments,
  _hre: HardhatRuntimeEnvironment
) {
  let env = process.env.ENV;
  if (!env) env = DEFAULT_ENV;

  const network = await _hre.getChainId();

  const deployments = getDeployments(contractType) as IDeploymentAdapters;
  let address;
  for (let i = 0; i < deployments[env][network].length; i++) {
    if (deployments[env][network][i].name === contractName) {
      address = deployments[env][network][i].address;
      break;
    }
  }

  if (!address) {
    console.log("Address not found in deployment file for ", contractName);
    return;
  }

  console.log(`Verifying ${contractName} Contract....`);
  await _hre.run("verify:verify", {
    address,
    constructorArguments: [
      NATIVE,
      WNATIVE[env][network],
      AAVE_V3_POOL[network],
      AAVE_V3_WRAPPED_TOKEN_GATEWAY[network],
      AAVE_V3_REFERRAL_CODE,
    ],
  });

  console.log(`Verified ${contractName} contract address `, address);
});
