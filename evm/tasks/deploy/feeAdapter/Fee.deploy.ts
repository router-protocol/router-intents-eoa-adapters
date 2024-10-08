import { HardhatRuntimeEnvironment, TaskArguments } from "hardhat/types";
import {
  CONTRACT_NAME,
  DEFAULT_ENV,
  DEPLOY_FEE_ADAPTER,
  NATIVE,
  VERIFY_FEE_ADAPTER,
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
import { FEE_WALLET } from "./constants";
import { FeeAdapter__factory } from "../../../typechain/factories/FeeAdapter__factory";
import { FeeDataStore__factory } from "../../../typechain/factories/FeeDataStore__factory";

const contractName: string = CONTRACT_NAME.FeeAdapter;
const contractType = ContractType.Fee;
task(DEPLOY_FEE_ADAPTER)
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
      FEE_WALLET,
      5
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
      await _hre.run(VERIFY_FEE_ADAPTER);
    }
  });

task(VERIFY_FEE_ADAPTER).setAction(async function (
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

  const feeAdapter = FeeAdapter__factory.connect(
    address!,
    _hre.ethers.provider
  );

  const dataStore = await feeAdapter.feeDataStore();
  const feeDataStore = FeeDataStore__factory.connect(
    dataStore,
    _hre.ethers.provider
  );
  const owner = await feeDataStore.owner();

  console.log(`Verifying ${contractName} Contract....`);

  await _hre.run("verify:verify", {
    address: dataStore,
    constructorArguments: [owner, 5, FEE_WALLET],
  });

  console.log(`Verifying ${contractName} Contract....`);
  await _hre.run("verify:verify", {
    address,
    constructorArguments: [NATIVE, WNATIVE[env][network], FEE_WALLET, 5],
  });

  console.log(`Verified ${contractName} contract address `, address);
});
