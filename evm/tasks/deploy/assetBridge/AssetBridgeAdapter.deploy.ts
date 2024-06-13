import { HardhatRuntimeEnvironment, TaskArguments } from "hardhat/types";
import {
  ASSET_BRIDGE,
  CONTRACT_NAME,
  DEFAULT_ENV,
  DEPLOY_ASSET_BRIDGE_ADAPTER,
  NATIVE,
  VERIFY_ASSET_BRIDGE_ADAPTER,
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
import { AssetBridgeAdapter__factory } from "../../../typechain/factories/AssetBridgeAdapter__factory";
import { AssetBridgeDataStore__factory } from "../../../typechain/factories/AssetBridgeDataStore__factory";

const contractName: string = CONTRACT_NAME.AssetBridgeAdapter;
const contractType = ContractType.Bridge;

task(DEPLOY_ASSET_BRIDGE_ADAPTER)
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
      ASSET_BRIDGE[env][network]
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
      await _hre.run(VERIFY_ASSET_BRIDGE_ADAPTER);
    }
  });

task(VERIFY_ASSET_BRIDGE_ADAPTER).setAction(async function (
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

  const assetBridgeAdapter = AssetBridgeAdapter__factory.connect(
    address!,
    _hre.ethers.provider
  );
  const dataStore = await assetBridgeAdapter.assetBridgeDataStore();
  const assetBridgeDataStore = AssetBridgeDataStore__factory.connect(
    dataStore,
    _hre.ethers.provider
  );
  const owner = await assetBridgeDataStore.owner();

  console.log(`Verifying ${contractName} Contract....`);

  await _hre.run("verify:verify", {
    address: dataStore,
    constructorArguments: [
      owner,
      ASSET_BRIDGE[env][network],
    ],
  });

  console.log(`Verifying ${contractName} Contract....`);
  await _hre.run("verify:verify", {
    address,
    constructorArguments: [
      NATIVE,
      WNATIVE[env][network],
      ASSET_BRIDGE[env][network],
    ],
  });

  console.log(`Verified ${contractName} contract address `, address);
});
