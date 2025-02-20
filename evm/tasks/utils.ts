/* eslint-disable no-unused-vars */
import fs from "fs";

export enum ContractType {
  None,
  LiquidStaking,
  Staking,
  LP,
  Swap,
  LendingBorrowing,
  Bridge,
  Perpetuals,
  StakestoneVault,
  Others,
  Fee,
  External,
}

export interface IDeployment {
  [env: string]: {
    [chainId: string]: {
      [contractName: string]: string;
    };
  };
}

export interface IDeploymentAdapters {
  [env: string]: {
    [chainId: string]: Array<{
      name: string;
      address: string;
    }>;
  };
}

const getFilePath = (contractType: ContractType): string => {
  let path = "deployment/deployments.json";

  if (contractType === ContractType.Bridge) path = "deployment/bridge.json";
  if (contractType === ContractType.Swap) path = "deployment/swap.json";
  if (contractType === ContractType.LiquidStaking)
    path = "deployment/liquid-staking.json";
  if (contractType === ContractType.Staking) path = "deployment/staking.json";
  if (contractType === ContractType.LendingBorrowing)
    path = "deployment/lending-borrowing.json";
  if (contractType === ContractType.StakestoneVault)
    path = "deployment/stake-stone-vault.json";
  if (contractType === ContractType.LP) path = "deployment/lp.json";
  if (contractType === ContractType.Perpetuals) path = "deployment/perps.json";
  if (contractType === ContractType.Fee) path = "deployment/fee.json";
  if (contractType === ContractType.Others) path = "deployment/others.json";
  if (contractType === ContractType.External) path = "deployment/external.json";

  return path;
};

export async function recordAllDeployments(
  env: string,
  network: string,
  contractType: ContractType,
  contractName: string,
  address: string
): Promise<IDeployment | IDeploymentAdapters> {
  const path = getFilePath(contractType);

  const deployment = JSON.parse(fs.readFileSync(path, "utf-8"));

  if (contractType === ContractType.None) {
    const deployments: IDeployment = deployment;

    if (!deployments[env]) {
      deployments[env] = {};
    }

    if (!deployments[env][network]) {
      deployments[env][network] = {};
    }

    deployments[env][network][contractName] = address;
    return deployments;
  } else {
    const deployments: IDeploymentAdapters = deployment;

    if (!deployments[env]) {
      deployments[env] = {};
    }

    if (!deployments[env][network]) {
      deployments[env][network] = [];
    }

    const length = deployments[env][network].length;

    let index = length;
    for (let i = 0; i < length; i++) {
      if (deployments[env][network][i].name === contractName) {
        index = i;
        break;
      }
    }

    deployments[env][network][index] = {
      name: contractName,
      address,
    };

    return deployments;
  }
}

export async function saveDeployments(
  contractType: ContractType,
  deployment: IDeployment | IDeploymentAdapters
) {
  const path = getFilePath(contractType);
  fs.writeFileSync(path, JSON.stringify(deployment));
}

export function getDeployments(
  contractType: ContractType
): IDeployment | IDeploymentAdapters {
  const path = getFilePath(contractType);
  const deployment = JSON.parse(fs.readFileSync(path, "utf-8"));

  if (contractType === ContractType.None) {
    const deployments: IDeployment = deployment;
    return deployments;
  } else {
    const deployments: IDeploymentAdapters = deployment;
    return deployments;
  }
}

export const delay = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));
