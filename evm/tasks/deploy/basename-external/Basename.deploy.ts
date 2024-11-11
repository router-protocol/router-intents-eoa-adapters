import { HardhatRuntimeEnvironment, TaskArguments } from "hardhat/types";
import {
  CONTRACT_NAME,
  DEFAULT_ENV,
  DEPLOY_BASENAME_REGISTRY_ADAPTER,
  NATIVE,
  VERIFY_BASENAME_REGISTRY_ADAPTER,
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
import { BASENAME_REGISTRY,
  BASENAME_REVERSE_REGISTRY,
  BASENAME_REVERSE_RESOLVER, } from "./constants";

const contractName: string = CONTRACT_NAME.BaseRegistry;
const contractType = ContractType.External;

task(DEPLOY_BASENAME_REGISTRY_ADAPTER)
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
      BASENAME_REGISTRY[network],
      BASENAME_REVERSE_REGISTRY[network],
      BASENAME_REVERSE_RESOLVER[network]
    );
    await instance.deployed();

    // const deployment = await recordAllDeployments(
    //   env,
    //   network,
    //   contractType,
    //   contractName,
    //   instance.address
    // );

    // await saveDeployments(contractType, deployment);

    console.log(`${contractName} contract deployed at`, instance.address);

    if (_taskArguments.verify === true) {
      await _hre.run(VERIFY_BASENAME_REGISTRY_ADAPTER);
    }
  });

task(VERIFY_BASENAME_REGISTRY_ADAPTER).setAction(async function (
  _taskArguments: TaskArguments,
  _hre: HardhatRuntimeEnvironment
) {
  let env = process.env.ENV;
  if (!env) env = DEFAULT_ENV;

  const network = await _hre.getChainId();

  const deployments = getDeployments(contractType) as IDeploymentAdapters;
  const address = "0x0e48f2Cb7061cfc06c7326bA5A55809a1A50D51A";
  // for (let i = 0; i < deployments[env][network].length; i++) {
  //   if (deployments[env][network][i].name === contractName) {
  //     address = deployments[env][network][i].address;
  //     break;
  //   }
  // }
  console.log(`Verifying ${contractName} Contract....`, address);
  await _hre.run("verify:verify", {
    address,
    constructorArguments: [
      NATIVE,
      WNATIVE[env][network],
      BASENAME_REGISTRY[network],
      BASENAME_REVERSE_REGISTRY[network],
      BASENAME_REVERSE_RESOLVER[network]
    ],
  });

  console.log(`Verified ${contractName} contract address `, address);
});
