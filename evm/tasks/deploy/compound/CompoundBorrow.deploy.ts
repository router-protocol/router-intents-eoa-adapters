import { HardhatRuntimeEnvironment, TaskArguments } from "hardhat/types";
import {
  CONTRACT_NAME,
  DEFAULT_ENV,
  DEPLOY_COMPOUND_BORROW_ADAPTER,
  NATIVE,
  VERIFY_COMPOUND_BORROW_ADAPTER,
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
  COMPOUND_USDC_POOL,
  COMPOUND_WETH_POOL,
  USDC,
  WETH,
} from "./constants";

const contractName: string = CONTRACT_NAME.CompoundBorrow;
const contractType = ContractType.LendingBorrowing;

task(DEPLOY_COMPOUND_BORROW_ADAPTER)
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
      WETH[network] || WNATIVE[network],
      USDC[network],
      COMPOUND_USDC_POOL[network],
      COMPOUND_WETH_POOL[network]
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
      await _hre.run(VERIFY_COMPOUND_BORROW_ADAPTER);
    }
  });

task(VERIFY_COMPOUND_BORROW_ADAPTER).setAction(async function (
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
  console.log(`Verifying ${contractName} Contract....`);
  await _hre.run("verify:verify", {
    address,
    constructorArguments: [
      NATIVE,
      WETH[network] || WNATIVE[network],
      USDC[network],
      COMPOUND_USDC_POOL[network],
      COMPOUND_WETH_POOL[network],
    ],
  });

  console.log(`Verified ${contractName} contract address `, address);
});
