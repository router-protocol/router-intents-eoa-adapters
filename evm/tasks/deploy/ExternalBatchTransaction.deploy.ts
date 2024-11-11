import { HardhatRuntimeEnvironment, TaskArguments } from "hardhat/types";
import {
  ASSET_BRIDGE,
  ASSET_FORWARDER,
  CONTRACT_NAME,
  DEFAULT_ENV,
  DEPLOY_EXTERNAL_BATCH_TRANSACTION,
  DEXSPAN,
  NATIVE,
  VERIFY_EXTERNAL_BATCH_TRANSACTION,
  WNATIVE,
} from "../constants";
import { task } from "hardhat/config";
import {
  ContractType,
  IDeployment,
  getDeployments,
  recordAllDeployments,
  saveDeployments,
} from "../utils";

const contractName: string = CONTRACT_NAME.BatchTransactionExternal;
const contractType = ContractType.None;

task(DEPLOY_EXTERNAL_BATCH_TRANSACTION)
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
      DEXSPAN[env][network],
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
      await _hre.run(VERIFY_EXTERNAL_BATCH_TRANSACTION);
    }
  });

task(VERIFY_EXTERNAL_BATCH_TRANSACTION).setAction(async function (
  _taskArguments: TaskArguments,
  _hre: HardhatRuntimeEnvironment
) {
  let env = process.env.ENV;
  if (!env) env = DEFAULT_ENV;

  const network = await _hre.getChainId();

  const deployments = getDeployments(contractType) as IDeployment;
  const address = deployments[env][network][contractName];

  console.log(`Verifying ${contractName} Contract....`);
  await _hre.run("verify:verify", {
    address,
    constructorArguments: [
      NATIVE,
      WNATIVE[env][network],
      ASSET_FORWARDER[env][network],
      DEXSPAN[env][network],
      ASSET_BRIDGE[env][network],
    ],
  });

  console.log(`Verified ${contractName} contract address `, address);
});
