import { HardhatRuntimeEnvironment, TaskArguments } from "hardhat/types";
import {
  ASSET_BRIDGE,
  ASSET_FORWARDER,
  CONTRACT_NAME,
  DEFAULT_ENV,
  DEPLOY_HYPER_LIQUID_ADAPTER,
  DEXSPAN,
  NATIVE,
  VERIFY_HYPER_LIQUID_ADAPTER,
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
import { USDC, DEPOSIT_BRIDGE } from "./constants";
import { HyperliquidAdapter__factory } from "../../../typechain/factories/HyperliquidAdapter__factory";
import { HyperliquidAdapterDataStore__factory } from "../../../typechain/factories/HyperliquidAdapterDataStore__factory";

const contractName: string = CONTRACT_NAME.HyperliquidAdapter;
const contractType = ContractType.LiquidStaking;
task(DEPLOY_HYPER_LIQUID_ADAPTER)
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
      ASSET_BRIDGE[env][network],
      USDC[network],
      DEPOSIT_BRIDGE[network]
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
      await _hre.run(VERIFY_HYPER_LIQUID_ADAPTER);
    }
  });

task(VERIFY_HYPER_LIQUID_ADAPTER).setAction(async function (
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

  const hlAdapter = HyperliquidAdapter__factory.connect(
      address!,
      _hre.ethers.provider
    );
    const dataStore = await hlAdapter.hlDataStore();

  const hlDataStore = HyperliquidAdapterDataStore__factory.connect(
      dataStore,
      _hre.ethers.provider
    );
    const owner = await hlDataStore.owner();
  
    console.log(`Verifying ${contractName} Contract....`);
  
    await _hre.run("verify:verify", {
      address: dataStore,
      constructorArguments: [
        owner,
        ASSET_FORWARDER[env][network],
        DEXSPAN[env][network],
        ASSET_BRIDGE[env][network]
      ],
      contract:
        "contracts/intent-adapters/hyperliquid/HyperliquidAdapter.sol:HyperliquidAdapterDataStore",
    });

  console.log(`Verifying ${contractName} Contract....`);
  await _hre.run("verify:verify", {
    address,
    constructorArguments: [
      NATIVE,
      WNATIVE[env][network],
      ASSET_FORWARDER[env][network],
      DEXSPAN[env][network],
      ASSET_BRIDGE[env][network],
      USDC[network],
      DEPOSIT_BRIDGE[network]
    ],
  });

  console.log(`Verified ${contractName} contract address `, address);
});
