import { HardhatRuntimeEnvironment, TaskArguments } from "hardhat/types";
import {
  ASSET_FORWARDER,
  CONTRACT_NAME,
  DEFAULT_ENV,
  DEPLOY_NITRO_ADAPTER,
  DEXSPAN,
  NATIVE,
  VERIFY_NITRO_ADAPTER,
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
import { NitroAdapter__factory } from "../../../typechain/factories/NitroAdapter__factory";
import { NitroDataStore__factory } from "../../../typechain/factories/NitroDataStore__factory";

const contractName: string = CONTRACT_NAME.NitroAdapter;
const contractType = ContractType.Bridge;

task(DEPLOY_NITRO_ADAPTER)
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
      ASSET_FORWARDER[env][network],
      DEXSPAN[env][network]
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
      await _hre.run(VERIFY_NITRO_ADAPTER);
    }
  });

task(VERIFY_NITRO_ADAPTER).setAction(async function (
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

  const nitroAdapter = NitroAdapter__factory.connect(
    address!,
    _hre.ethers.provider
  );
  const dataStore = await nitroAdapter.nitroDataStore();
  const nitroDataStore = NitroDataStore__factory.connect(
    dataStore,
    _hre.ethers.provider
  );
  const owner = await nitroDataStore.owner();

  console.log(`Verifying ${contractName} Contract....`);

  await _hre.run("verify:verify", {
    address: dataStore,
    constructorArguments: [
      owner,
      ASSET_FORWARDER[env][network],
      DEXSPAN[env][network],
    ],
    contract: "contracts/intent-adapters/bridge/NitroAdapter.sol:NitroDataStore"
  });

  console.log(`Verifying ${contractName} Contract....`);
  await _hre.run("verify:verify", {
    address,
    constructorArguments: [
      NATIVE,
      WNATIVE[env][network],
      ASSET_FORWARDER[env][network],
      DEXSPAN[env][network],
    ],
  });

  console.log(`Verified ${contractName} contract address `, address);
});
