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

const contractName = CONTRACTS.AssetBridgeAdapter;

// ts-node ./scripts/Bridge/AssetBridgeAdapter.deploy.ts --network "shasta"
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
    [etronWeb.fromHex(ETH), WETH[env][chainId], etronWeb.fromHex(ASSET_BRIDGE[env][chainId])]
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
