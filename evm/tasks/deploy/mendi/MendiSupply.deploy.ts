import { HardhatRuntimeEnvironment, TaskArguments } from "hardhat/types";
import {
  CONTRACT_NAME,
  DEFAULT_ENV,
  DEPLOY_MENDI_SUPPLY_ADAPTER,
  NATIVE,
  VERIFY_MENDI_SUPPLY_ADAPTER,
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
import { MENDI_TOKENS } from "./constants";

const contractName: string = CONTRACT_NAME.MendiSupply;
const contractType = ContractType.LendingBorrowing;

task(DEPLOY_MENDI_SUPPLY_ADAPTER)
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
      MENDI_TOKENS[network]["usdc"].token,
      MENDI_TOKENS[network]["usdt"].token,
      MENDI_TOKENS[network]["dai"].token,
      MENDI_TOKENS[network]["wbtc"].token,
      MENDI_TOKENS[network]["wstEth"].token,
      MENDI_TOKENS[network]["weth"].cToken,
      MENDI_TOKENS[network]["usdc"].cToken,
      MENDI_TOKENS[network]["usdt"].cToken,
      MENDI_TOKENS[network]["dai"].cToken,
      MENDI_TOKENS[network]["wbtc"].cToken,
      MENDI_TOKENS[network]["wstEth"].cToken
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
      await _hre.run(VERIFY_MENDI_SUPPLY_ADAPTER);
    }
  });

task(VERIFY_MENDI_SUPPLY_ADAPTER).setAction(async function (
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
      WNATIVE[env][network],
      MENDI_TOKENS[network]["usdc"].token,
      MENDI_TOKENS[network]["usdt"].token,
      MENDI_TOKENS[network]["dai"].token,
      MENDI_TOKENS[network]["wbtc"].token,
      MENDI_TOKENS[network]["wstEth"].token,
      MENDI_TOKENS[network]["weth"].cToken,
      MENDI_TOKENS[network]["usdc"].cToken,
      MENDI_TOKENS[network]["usdt"].cToken,
      MENDI_TOKENS[network]["dai"].cToken,
      MENDI_TOKENS[network]["wbtc"].cToken,
      MENDI_TOKENS[network]["wstEth"].cToken,
    ],
  });

  console.log(`Verified ${contractName} contract address `, address);
});
