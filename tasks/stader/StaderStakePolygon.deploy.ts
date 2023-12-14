import { HardhatRuntimeEnvironment, TaskArguments } from "hardhat/types";
import {
  ASSET_FORWARDER,
  CONTRACT_NAME,
  DEFAULT_ENV,
  DEFAULT_REFUND_ADDRESS,
  DEPLOY_STADER_STAKE_POLYGON_ADAPTER,
  DEXSPAN,
  NATIVE,
  VERIFY_STADER_STAKE_POLYGON_ADAPTER,
  WNATIVE,
} from "../constants";
import { task } from "hardhat/config";
import {
  IDeployment,
  getDeployments,
  recordAllDeployments,
  saveDeployments,
} from "../utils";
import { STADER_MATIC_X_TOKEN, STADER_POOL } from "./constants";

const contractName = CONTRACT_NAME.StaderStakePolygon;

task(DEPLOY_STADER_STAKE_POLYGON_ADAPTER)
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
      DEFAULT_REFUND_ADDRESS,
      STADER_MATIC_X_TOKEN[network],
      STADER_POOL[network]
    );
    await instance.deployed();

    const deployment: IDeployment = await recordAllDeployments(
      env,
      network,
      contractName,
      instance.address
    );

    await saveDeployments(deployment);

    console.log(`${contractName} contract deployed at`, instance.address);

    if (_taskArguments.verify === true) {
      await _hre.run(VERIFY_STADER_STAKE_POLYGON_ADAPTER);
    }
  });

task(VERIFY_STADER_STAKE_POLYGON_ADAPTER).setAction(async function (
  _taskArguments: TaskArguments,
  _hre: HardhatRuntimeEnvironment
) {
  let env = process.env.ENV;
  if (!env) env = DEFAULT_ENV;

  const network = await _hre.getChainId();

  const deployments: IDeployment = getDeployments();
  const address = deployments[env][network][contractName];

  console.log(`Verifying ${contractName} Contract....`);
  await _hre.run("verify:verify", {
    address,
    constructorArguments: [
      NATIVE,
      WNATIVE[env][network],
      ASSET_FORWARDER[env][network],
      DEXSPAN[env][network],
      DEFAULT_REFUND_ADDRESS,
      STADER_MATIC_X_TOKEN[network],
      STADER_POOL[network],
    ],
  });

  console.log(`Verified ${contractName} contract address `, address);
});
