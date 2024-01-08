export const DEFAULT_ENV = "testnet";
export const DEFAULT_NETWORK = "shasta";
export const ETH = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
export const DEFAULT_REFUND_ADDRESS =
  "0x54485755c209Cb47A4c7aAeAF3a14818CFe675A5";
export const DEFAULT_OWNER = "0x54485755c209Cb47A4c7aAeAF3a14818CFe675A5";

export const WETH: { [network: string]: { [chainId: string]: string } } = {
  testnet: {
    "728126428": "0x0000000000000000000000000000000000000000",
    "2494104990": "0x0000000000000000000000000000000000000000",
  },
};

export const ASSET_FORWARDER: {
  [network: string]: { [chainId: string]: string };
} = {
  testnet: {
    "728126428": "0x0000000000000000000000000000000000000000",
    "2494104990": "0x97a8f93185d5f535e6a7dc4609eaf2757485c8fd",
  },
};

export const DEXSPAN: { [network: string]: { [chainId: string]: string } } = {
  testnet: {
    "728126428": "0x0000000000000000000000000000000000000000",
    "2494104990": "0x0000000000000000000000000000000000000000",
  },
};

export const CONTRACTS: { [key: string]: string } = {
  JustLendStakeTrx: "JustLendStakeTrx",
};
