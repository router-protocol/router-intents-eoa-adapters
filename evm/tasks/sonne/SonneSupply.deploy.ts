import { HardhatRuntimeEnvironment, TaskArguments } from "hardhat/types";
import {
  ASSET_FORWARDER,
  CONTRACT_NAME,
  DEFAULT_ENV,
  DEFAULT_OWNER,
  DEFAULT_REFUND_ADDRESS,
  DEPLOY_SONNE_SUPPLY_ADAPTER,
  DEXSPAN,
  NATIVE,
  VERIFY_SONNE_SUPPLY_ADAPTER,
  WNATIVE,
} from "../constants";
import { task } from "hardhat/config";
import {
  IDeployment,
  getDeployments,
  recordAllDeployments,
  saveDeployments,
} from "../utils";
import { 
    SONNE_SO_DAI,
    SONNE_SO_LUSD,
    SONNE_SO_OP,
    SONNE_SO_SNX,
    SONNE_SO_SUSD,
    SONNE_SO_USDC,
    SONNE_SO_USDT,
    SONNE_SO_WBTC,
    SONNE_SO_WETH,
    SONNE_SO_WST_ETH,
    SONNE_SO_bDAI,
    SONNE_SO_bUSDC,
    SONNE_SO_bUSDbC,
    SONNE_SO_bWETH 
} from "./constants";

const contractName: string = CONTRACT_NAME.SonneSupply;

task(DEPLOY_SONNE_SUPPLY_ADAPTER)
  .addFlag("verify", "pass true to verify the contract")
  .setAction(async function (
    _taskArguments: TaskArguments,
    _hre: HardhatRuntimeEnvironment
  ) {
    let env = process.env.ENV;
    if (!env) env = DEFAULT_ENV;

    let defaultRefundAddress = process.env.DEFAULT_REFUND_ADDRESS;
    if (!defaultRefundAddress) defaultRefundAddress = DEFAULT_REFUND_ADDRESS;

    let owner = process.env.OWNER;
    if (!owner) owner = DEFAULT_OWNER;

    const network = await _hre.getChainId();

    console.log(`Deploying ${contractName} Contract on chainId ${network}....`);
    const factory = await _hre.ethers.getContractFactory(contractName);
    const instance = await factory.deploy(
      NATIVE,
      WNATIVE[env][network],
      owner,
      ASSET_FORWARDER[env][network],
      DEXSPAN[env][network],
      SONNE_SO_USDC[network],
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
      await _hre.run(VERIFY_SONNE_SUPPLY_ADAPTER);
    }
  });

task(VERIFY_SONNE_SUPPLY_ADAPTER).setAction(async function (
  _taskArguments: TaskArguments,
  _hre: HardhatRuntimeEnvironment
) {
  let env = process.env.ENV;
  if (!env) env = DEFAULT_ENV;

  let defaultRefundAddress = process.env.DEFAULT_REFUND_ADDRESS;
  if (!defaultRefundAddress) defaultRefundAddress = DEFAULT_REFUND_ADDRESS;

  let owner = process.env.OWNER;
  if (!owner) owner = DEFAULT_OWNER;

  const network = await _hre.getChainId();

  const deployments: IDeployment = getDeployments();
  const address = deployments[env][network][contractName];

  console.log(`Verifying ${contractName} Contract....`);
  await _hre.run("verify:verify", {
    address,
    constructorArguments: [
      NATIVE,
      WNATIVE[env][network],
      owner,
      ASSET_FORWARDER[env][network],
      DEXSPAN[env][network],
      SONNE_SO_USDC[network],
    ],
  });

  console.log(`Verified ${contractName} contract address `, address);
});
