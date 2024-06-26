import { HardhatRuntimeEnvironment, TaskArguments } from "hardhat/types";
import {
  CONTRACT_NAME,
  DEFAULT_ENV,
  DEPLOY_DEXSPAN_ADAPTER,
  DEXSPAN,
  NATIVE,
  VERIFY_DEXSPAN_ADAPTER,
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
import { DexSpanAdapter__factory } from "../../../typechain/factories/DexSpanAdapter__factory";
import { DexSpanDataStore__factory } from "../../../typechain/factories/DexSpanDataStore__factory";

const contractName: string = CONTRACT_NAME.DexSpanAdapter;
const contractType = ContractType.Swap;

task(DEPLOY_DEXSPAN_ADAPTER)
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
      await _hre.run(VERIFY_DEXSPAN_ADAPTER);
    }
  });

task(VERIFY_DEXSPAN_ADAPTER).setAction(async function (
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

  const dexspanAdapter = DexSpanAdapter__factory.connect(
    address!,
    _hre.ethers.provider
  );
  const dataStore = await dexspanAdapter.dexSpanDataStore();
  const dexspanDataStore = DexSpanDataStore__factory.connect(
    dataStore,
    _hre.ethers.provider
  );
  const owner = await dexspanDataStore.owner();

  console.log(`Verifying ${contractName} Contract....`);

  await _hre.run("verify:verify", {
    address: dataStore,
    constructorArguments: [owner, DEXSPAN[env][network]],
  });

  await _hre.run("verify:verify", {
    address,
    constructorArguments: [
      NATIVE,
      WNATIVE[env][network],
      DEXSPAN[env][network],
    ],
  });

  console.log(`Verified ${contractName} contract address `, address);
});
