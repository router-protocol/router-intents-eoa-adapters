import { HardhatRuntimeEnvironment, TaskArguments } from "hardhat/types";
import { task } from "hardhat/config";
import {
  ContractType,
  IDeployment,
  IDeploymentAdapters,
  getDeployments,
} from "../utils";
import {
  CONTRACT_NAME,
  DEFAULT_ENV,
  SET_ADAPTERS_ON_BATCH_TX,
} from "../constants";
import { BatchTransaction__factory } from "../../typechain/factories/BatchTransaction__factory";
import { DexSpanAdapter__factory } from "../../typechain/factories/DexSpanAdapter__factory";
import { DexSpanDataStore__factory } from "../../typechain/factories/DexSpanDataStore__factory";
import { NitroAdapter__factory } from "../../typechain/factories/NitroAdapter__factory";
import { NitroDataStore__factory } from "../../typechain/factories/NitroDataStore__factory";

const contractName = CONTRACT_NAME.DexSpanAdapter;

task("SETDEXSPAN").setAction(async function (
  _taskArguments: TaskArguments,
  _hre: HardhatRuntimeEnvironment
) {
  let env = process.env.ENV;
  if (!env) env = DEFAULT_ENV;

  const network = await _hre.getChainId();

  console.log(
    `Setting Adapters on ${contractName} Contract on chainId ${network}....`
  );

  const signer = _hre.ethers.provider.getSigner();

  const deployment = getDeployments(ContractType.Swap) as IDeploymentAdapters;

  const instance = DexSpanAdapter__factory.connect(
    deployment[env][network][0].address,
    signer
  );

  const dataStore = await instance.dexSpanDataStore();
  const dexspanDataStore = DexSpanDataStore__factory.connect(
    dataStore,
    signer
  );

  const tx = await dexspanDataStore.transferOwnership("0x77834697bEC6B098a7325538f0fF0565293ccDe5");
  await tx.wait(1);

  console.log("tx hash: ", tx.hash);
});