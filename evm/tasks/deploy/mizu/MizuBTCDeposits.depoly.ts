import { HardhatRuntimeEnvironment, TaskArguments } from "hardhat/types";
import {
  CONTRACT_NAME,
  DEFAULT_ENV,
  DEPLOY_MIZU_BTC_DEPOSITS_ADAPTER,
  NATIVE,
  VERIFY_MIZU_BTC_DEPOSITS_ADAPTER,
  WNATIVE,
} from "../../constants";
import { task } from "hardhat/config";
import {
  ContractType,
  getDeployments,
  IDeploymentAdapters,
  recordAllDeployments,
  saveDeployments,
} from "../../utils";
import {
  HYPER_BTC,
  BTC_DEPOSITS_VAULT,
  WBTC,
  eBTC,
  stBTC,
  SolvBTC,
  cbBTC,
  swBTC,
  LBTC,
  SBTC,
} from "./constants";

const contractName: string = CONTRACT_NAME.MizuBTCDeposits;
const contractType = ContractType.LiquidStaking;

task(DEPLOY_MIZU_BTC_DEPOSITS_ADAPTER)
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
      HYPER_BTC[network],
      BTC_DEPOSITS_VAULT[network],
      [WBTC, eBTC, stBTC, SolvBTC, cbBTC, swBTC, LBTC, SBTC]
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
      await _hre.run(VERIFY_MIZU_BTC_DEPOSITS_ADAPTER);
    }
  });

task(VERIFY_MIZU_BTC_DEPOSITS_ADAPTER).setAction(async function (
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
      HYPER_BTC[network],
      BTC_DEPOSITS_VAULT[network],
      [WBTC, eBTC, stBTC, SolvBTC, cbBTC, swBTC, LBTC, SBTC],
    ],
  });

  console.log(`Verified ${contractName} contract address `, address);
});
