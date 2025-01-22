import { HardhatRuntimeEnvironment, TaskArguments } from "hardhat/types";
import {
  CONTRACT_NAME,
  DEFAULT_ENV,
  DEPLOY_PARIFI_WRAPPER_ADAPTER,
  NATIVE,
  VERIFY_PARIFI_WRAPPER_ADAPTER,
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
import { ParifiIntentWrapper__factory } from "../../../typechain/factories/ParifiIntentWrapper__factory";
import { ParifiTargetDataStore__factory } from "../../../typechain/factories/ParifiTargetDataStore__factory";

const contractName: string = CONTRACT_NAME.ParifiIntentWrapper;
const contractType = ContractType.Perpetuals;

const STABLE_PROXY = "0x18141523403e2595D31b22604AcB8Fc06a4CaA61";
const SYNTHETIC_PROXY = "0x0A2AF931eFFd34b81ebcc57E3d3c9B1E1dE1C9Ce";

task(DEPLOY_PARIFI_WRAPPER_ADAPTER)
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
      STABLE_PROXY,
      SYNTHETIC_PROXY
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
      await _hre.run(VERIFY_PARIFI_WRAPPER_ADAPTER);
    }
  });

task(VERIFY_PARIFI_WRAPPER_ADAPTER).setAction(async function (
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
  const parifiAdapter = ParifiIntentWrapper__factory.connect(
    address!,
    _hre.ethers.provider
  );

  const dataStore = await parifiAdapter.parifiTargetDataStore();
  const parifiDataStore = ParifiTargetDataStore__factory.connect(
    dataStore,
    _hre.ethers.provider
  );
  const owner = await parifiDataStore.owner();

  console.log(`Verifying ${contractName} Contract....`);
  await _hre.run("verify:verify", {
    address: dataStore,
    constructorArguments: [owner, STABLE_PROXY, SYNTHETIC_PROXY],
  });

  console.log(`Verifying ${contractName} Contract....`);
  await _hre.run("verify:verify", {
    address,
    constructorArguments: [
      NATIVE,
      WNATIVE[env][network],
      STABLE_PROXY,
      SYNTHETIC_PROXY,
    ],
  });

  console.log(`Verified ${contractName} contract address `, address);
});
