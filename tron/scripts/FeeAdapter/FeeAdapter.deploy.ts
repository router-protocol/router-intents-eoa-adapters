import { ExtraTronWeb } from "../ExtraTronWeb";
import {
  parseCommandLineArgs,
  recordAllDeployments,
  saveDeployments,
} from "../utils";
import fs from "fs";
import path from "path";
import {
  ETH,
  WETH,
  CONTRACTS,
  ASSET_FORWARDER,
  DEXSPAN,
  DEFAULT_ENV,
  DEFAULT_NETWORK,
  DEFAULT_OWNER,
  ASSET_BRIDGE,
} from "../constants";

const contractName = CONTRACTS.FeeAdapter;

// ts-node ./scripts/FeeAdapter/FeeAdapter.deploy.ts --network "testnet"
async function main() {
  console.log(`${contractName} Deployment Started:`);

  const contractJson = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, `../../build/contracts/${contractName}.json`),
      "utf-8"
    )
  );

  const networkJson = JSON.parse(
    fs.readFileSync(path.join(__dirname, "../../tron.config.json"), "utf-8")
  );

  let { network } = parseCommandLineArgs(process.argv);

  let env = process.env.ENV;
  if (!env) env = DEFAULT_ENV;
  if (!network) network = DEFAULT_NETWORK;
  const chainId = networkJson[network].chainId;

  const etronWeb = new ExtraTronWeb(network);

  // Deploy contract
  const response = await etronWeb.deployWithParams(
    {
      feeLimit: 15000000000,
      userFeePercentage: 100,
      abi: contractJson.abi,
      bytecode: contractJson.bytecode,
      name: contractName,
    },
    [
      "0x4142232832BF6C9548B25F08BFE908B4728DE1C3",
      "0x891CDB91D149F23B1A45D9C5CA78A88D0CB44C18",
      "0x4120C8BB95BAF192345993F1BB38519D2C5B1193",
      5,
    ]
  );

  console.log(
    `${contractName} contract deployed at: ${etronWeb.toHex(response.address)}`
  );
  const deployments = await recordAllDeployments(
    env,
    etronWeb.chainId,
    contractName,
    etronWeb.toHex(response.address)
  );

  await saveDeployments(deployments);
}

main().catch((err) => {
  console.log("Error: ", err);
});
