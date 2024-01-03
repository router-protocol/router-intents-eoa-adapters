import fs from "fs";

export interface IDeployment {
  [key: string]: {
    [key: string]: {
      [key: string]: string;
    };
  };
}

export async function recordAllDeployments(
  env: string,
  network: string,
  contractName: string,
  address: string
) {
  const deployment = JSON.parse(
    fs.readFileSync("deployment/deployments.json", "utf-8")
  );
  const deployments: IDeployment = deployment;

  if (!deployment[env]) {
    deployments[env] = {};
  }

  if (!deployments[env][network]) {
    deployments[env][network] = {};
  }

  deployments[env][network][contractName] = address;

  return deployments;
}

export async function saveDeployments(deployment: IDeployment) {
  fs.writeFileSync("deployment/deployments.json", JSON.stringify(deployment));
}

export function getDeployments() {
  const deployment = JSON.parse(
    fs.readFileSync("deployment/deployments.json", "utf-8")
  );
  const deployments: IDeployment = deployment;

  return deployments;
}

export function parseCommandLineArgs(args: string[]): any {
  const parsedArgs: any = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith("--")) parsedArgs[arg.slice(2)] = args[i + 1];
  }
  return parsedArgs;
}
