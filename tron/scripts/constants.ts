export const DEFAULT_ENV = "shasta";
export const DEFAULT_NETWORK = "shasta";
export const ETH = "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb";
export const DEFAULT_REFUND_ADDRESS = "TLs8g5wh1T7im8X3FbyqPBEEBrkfRSnN3t";
export const DEFAULT_OWNER = "TLs8g5wh1T7im8X3FbyqPBEEBrkfRSnN3t";

export const WETH: { [network: string]: { [chainId: string]: string } } = {
  mainnet: {
    "728126428": "TNUC9Qb1rRpS5CbWLmNMxXBjyFoydXjWFR",
  },
  shasta: {
    "2494104990": "",
  },
};

export const ASSET_FORWARDER: {
  [network: string]: { [chainId: string]: string };
} = {
  mainnet: {
    "728126428": "0x9d25b8289c0f3789237c1b3a88264882eed6c610",
  },
  shasta: {
    "2494104990": "0x0000000000000000000000000000000000000000",
  },
};

export const ASSET_BRIDGE: {
  [network: string]: { [chainId: string]: string };
} = {
  mainnet: {
    "728126428": "0x02059ddcd0ed02e4eee4a050fddc200df4e8a37b",
  },
  shasta: {
    "2494104990": "0x0000000000000000000000000000000000000000",
  },
};

export const DEXSPAN: { [network: string]: { [chainId: string]: string } } = {
  mainnet: {
    "728126428": "0x0000000000000000000000000000000000000000",
  },
  shasta: {
    "2494104990": "0x0000000000000000000000000000000000000000",
  },
};

export const CONTRACTS: { [key: string]: string } = {
  JustLendStakeTrx: "JustLendStakeTrx",
  SunswapMint: "SunswapMint",
  JustLendSupply: "JustLendSupply",
  BatchTransaction: "BatchTransaction",
  FeeAdapter: "FeeAdapter",
  NitroAdapter: "NitroAdapter",
  DexSpanAdapter: "DexSpanAdapter",
  AssetBridgeAdapter: "AssetBridgeAdapter",
};
