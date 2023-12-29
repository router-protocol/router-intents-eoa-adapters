import { HardhatRuntimeEnvironment, TaskArguments } from "hardhat/types";
import {
  ASSET_FORWARDER,
  CONTRACT_NAME,
  DEFAULT_ENV,
  DEFAULT_OWNER,
  DEFAULT_REFUND_ADDRESS,
  DEPLOY_COMPOUND_BORROW_ADAPTER,
  DEXSPAN,
  NATIVE,
  VERIFY_COMPOUND_BORROW_ADAPTER,
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
  COMPOUND_USDC_POOL,
  COMPOUND_WETH_POOL,
  USDC,
  WETH
} from "./constants";

const contractName: string = CONTRACT_NAME.CompoundBorrow;

task(DEPLOY_COMPOUND_BORROW_ADAPTER)
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
      WETH[network],
      owner,
      ASSET_FORWARDER[env][network],
      DEXSPAN[env][network],
      DEFAULT_REFUND_ADDRESS,
      USDC[network],
      COMPOUND_USDC_POOL[network],
      COMPOUND_WETH_POOL[network]
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
      await _hre.run(VERIFY_COMPOUND_BORROW_ADAPTER);
    }
  });

task(VERIFY_COMPOUND_BORROW_ADAPTER).setAction(async function (
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
      WETH[network],
      owner,
      ASSET_FORWARDER[env][network],
      DEXSPAN[env][network],
      DEFAULT_REFUND_ADDRESS,
      USDC[network],
      COMPOUND_USDC_POOL[network],
      COMPOUND_WETH_POOL[network]
    ],
  });

  console.log(`Verified ${contractName} contract address `, address);
});
