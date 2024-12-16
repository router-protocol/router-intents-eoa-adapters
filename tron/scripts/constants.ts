export const DEFAULT_ENV = "testnet";
export const DEFAULT_NETWORK = "shasta";
export const ETH = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
export const DEFAULT_REFUND_ADDRESS =
  "TLs8g5wh1T7im8X3FbyqPBEEBrkfRSnN3t";
export const DEFAULT_OWNER = "TLs8g5wh1T7im8X3FbyqPBEEBrkfRSnN3t";

export const WETH: { [network: string]: { [chainId: string]: string } } = {
  testnet: {
    "728126428": "0x0000000000000000000000000000000000000000",
    "2494104990": "0x0000000000000000000000000000000000000000",
    "3448148188": "0x0000000000000000000000000000000000000000",
  },
};

export const ASSET_FORWARDER: {
  [network: string]: { [chainId: string]: string };
} = {
  mainnet: {
    "728126428": "0x9d25b8289c0f3789237c1b3a88264882eed6c610",
  },
  testnet: {
    "728126428": "0x9d25b8289c0f3789237c1b3a88264882eed6c610",
    "2494104990": "0x0000000000000000000000000000000000000000",
    "3448148188": "0x0000000000000000000000000000000000000000",
  },
};

export const ASSET_BRIDGE: {
  [network: string]: { [chainId: string]: string };
} = {
  mainnet: {
    "728126428": "0x02059ddcd0ed02e4eee4a050fddc200df4e8a37b",
  },
  testnet: {
    "728126428": "0x02059ddcd0ed02e4eee4a050fddc200df4e8a37b",
    "2494104990": "0x0000000000000000000000000000000000000000",
    "3448148188": "0x0000000000000000000000000000000000000000",
  },
};

export const DEXSPAN: { [network: string]: { [chainId: string]: string } } = {
  mainnet: {
    "728126428": "0x0000000000000000000000000000000000000000",
  },
  testnet: {
    "728126428": "0x0000000000000000000000000000000000000000",
    "2494104990": "0x0000000000000000000000000000000000000000",
    "3448148188": "0x0000000000000000000000000000000000000000",
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
  AssetBridgeAdapter: "AssetBridgeAdapter"
};
