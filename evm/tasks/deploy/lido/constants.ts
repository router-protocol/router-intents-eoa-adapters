export const LIDO_ST_ETH: { [chainId: string]: string } = {
  "1": "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84",
  "5": "0x1643E812aE58766192Cf7D2Cf9567dF2C37e9B7F",
  "11155111": "0x3e3FE7dBc6B4C189E7128855dD526361c49b40Af", // sepolia
};

export const LIDO_ST_MATIC: { [chainId: string]: string } = {
  "1": "0x9ee91F9f426fA633d227f7a9b000E28b9dfd8599",
  "5": "0x9A7c69A167160C507602ecB3Df4911e8E98e1279",
};

export const MATIC: { [chainId: string]: string } = {
  "1": "0x7D1AfA7B718fb893dB30A3aBc0Cfc608AaCfeBB0",
  "5": "0x499d11E0b6eAC7c0593d8Fb292DCBbF815Fb29Ae",
};

// TODO: get actual referral address from Lido.
export const LIDO_REFERRAL_ADDRESS =
  "0x6c7E6e9985f97278DcA3aa6C4Be999CD13C128fD";

export const LIDO_WST_ETH: { [chainId: string]: string } = {
  "1": "0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0",
  "42161": "0x5979D7b546E38E414F7E9822514be443A4800529",
  "10": "0x1F32b1c2345538c0c6f582fCB022739c4A194Ebb",
  "8453": "0xc1CBa3fCea344f92D9239c08C0568f6F2F0ee452",
  "59144": "0xB5beDd42000b71FddE22D3eE8a79Bd49A568fC8F",
  "5000": "0x458ed78EB972a369799fb278c0243b25e5242A83",
  "324": "0x703b52F2b28fEbcB60E1372858AF5b18849FE867",
  "11155111": "0xB82381A3fBD3FaFA77B3a7bE693342618240067b", // sepolia
  "11155420": "0x24B47cd3A74f1799b32B2de11073764Cb1bb318B", // optimism-sepolia
  "534351": "0x2DAf22Caf40404ad8ff0Ab1E77F9C08Fef3953e2", // scroll-sepolia
};

export const LIDO_ARBITRUM_GATEWAY: { [chainId: string]: string } = {
  "1": "0x0F25c1DC2a9922304f2eac71DCa9B07E310e8E5a",
};

export const LIDO_OPTIMISM_GATEWAY: { [chainId: string]: string } = {
  "1": "0x76943C0D61395d8F2edF9060e1533529cAe05dE6",
  "11155111": "0x4Abf633d9c0F4aEebB4C2E3213c7aa1b8505D332", // sepolia
};

export const LIDO_BASE_GATEWAY: { [chainId: string]: string } = {
  "1": "0x9de443AdC5A411E83F1878Ef24C3F52C61571e72",
};

export const LIDO_MANTLE_GATEWAY: { [chainId: string]: string } = {
  "1": "0x2D001d79E5aF5F65a939781FE228B267a8Ed468B",
};

export const LIDO_ZKSYNC_GATEWAY: { [chainId: string]: string } = {
  "1": "0x41527B2d03844dB6b0945f25702cB958b6d55989",
};

export const LIDO_LINEA_GATEWAY: { [chainId: string]: string } = {
  "1": "0x051f1d88f0af5763fb888ec4378b4d8b29ea3319",
};

export const LIDO_SCROLL_GATEWAY: { [chainId: string]: string } = {
  "1": "0xF8B1378579659D8F7EE5f3C929c2f3E332E41Fd6",
  "11155111": "0xF22B24fa7c3168f30b17fd97b71bdd3162DDe029", // sepolia
};

export const SCROLL_MESSAGING_QUEUE: { [chainId: string]: string } = {
  "1": "0x0d7E906BD9cAFa154b048cFa766Cc1E54E39AF9B",
  "11155111": "0xF0B2293F5D834eAe920c6974D50957A1732de763", // sepolia
};
