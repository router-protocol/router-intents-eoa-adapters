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

const contractName = CONTRACTS.BatchTransaction;

// ts-node ./scripts/BatchTransaction/BatchTransaction.configure.ts --network "shasta"
async function main() {
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

  const batchInstance = etronWeb.tronWeb.contract(
    contractJson.abi,
    "TVfiuyQ25KezC8Emz4nff9zSpNJH4cNMnB"
  );

  const setWhitelistTxHash = await (
    await batchInstance.setAdapterWhitelist(
      [
        "TYMRZCXEMEnASXZaEzL8b3d6Ey8ec4qopu",
        "TNbhmKx5yf7JBAYeWcWtNiEPS5UdkPtH9R",
        "TLXRoj6sKUXoUHMAHQgutA1HnHvcgX15cd",
        "TSYFQjohptEqtqcscwHLYF4HWRPUaJrrJ2",
      ],
      [true, true, true, true]
    )
  ).send();
  console.log("BATCH -  SETADAPTERWHITELIST: txhash: ", setWhitelistTxHash);
}

main().catch((err) => {
  console.log("Error: ", err);
});
