import { WNATIVE } from "../../constants";

export const MENDI_TOKENS: {
  [chainId: string]: {
    [token: string]: {
      token: string;
      cToken: string;
    };
  };
} = {
  "59144": {
    weth: {
      token: WNATIVE["mainnet"]["59144"],
      cToken: "0xAd7f33984bed10518012013D4aB0458D37FEE6F3",
    },
    usdc: {
      token: "0x176211869cA2b568f2A7D4EE941E073a821EE1ff",
      cToken: "0x333D8b480BDB25eA7Be4Dd87EEB359988CE1b30D",
    },
    usdt: {
      token: "0xA219439258ca9da29E9Cc4cE5596924745e12B93",
      cToken: "0xf669C3C03D9fdF4339e19214A749E52616300E89",
    },
    dai: {
      token: "0x4AF15ec2A0BD43Db75dd04E62FAA3B8EF36b00d5",
      cToken: "0x1f27f81C1D13Dd96A3b75d42e3d5d92b709869AA",
    },
    wbtc: {
      token: "0x3aAB2285ddcDdaD8edf438C1bAB47e1a9D05a9b4",
      cToken: "0x9be5e24F05bBAfC28Da814bD59284878b388a40f",
    },
    wstEth: {
      token: "0xB5beDd42000b71FddE22D3eE8a79Bd49A568fC8F",
      cToken: "0xCeEd853798ff1c95cEB4dC48f68394eb7A86A782",
    },
  },
};
