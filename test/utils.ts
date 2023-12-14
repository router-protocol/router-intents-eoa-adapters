/* eslint-disable node/no-unsupported-features/es-syntax */
import axios from "axios";
import { defaultAbiCoder } from "ethers/lib/utils";
import { NATIVE } from "../tasks/constants";

const PATH_FINDER_API_URL = "https://api.pf.testnet.routerprotocol.com/api";

export const getPathfinderData = async (
  fromTokenAddress: string,
  toTokenAddress: string,
  amount: string,
  fromTokenChainId: string,
  toTokenChainId: string,
  recipient: string
) => {
  const quoteParams = {
    fromTokenAddress,
    toTokenAddress,
    amount,
    fromTokenChainId,
    toTokenChainId,
  };

  const quoteData = await getQuote(quoteParams);

  if (toTokenAddress === NATIVE && fromTokenChainId === toTokenChainId) {
    quoteData.source.path[quoteData.source.path.length - 1] = NATIVE;
  }

  if (fromTokenAddress === NATIVE) {
    quoteData.source.path[0] = NATIVE;
  }

  const swapParamsIface =
    "tuple(address[] tokens,uint256 amount,uint256 minReturn,uint256[] flags,bytes[] dataTx, address recipient) SwapParams";

  const data = defaultAbiCoder.encode(
    [swapParamsIface],
    [
      {
        tokens: quoteData?.source?.path,
        amount,
        minReturn: quoteData?.destination?.tokenAmount,
        flags: quoteData?.source?.flags,
        dataTx: quoteData?.source?.dataTx,
        recipient,
      },
    ]
  );

  return {
    data: data,
    minReturn: quoteData?.destination?.tokenAmount,
  };
};

const getQuote = async (params: any) => {
  const endpoint = "v2/quote";
  const quoteUrl = `${PATH_FINDER_API_URL}/${endpoint}`;

  try {
    const res = await axios.get(quoteUrl, { params });
    return res.data;
  } catch (e) {
    console.error(`Fetching quote data from pathfinder: ${e}`);
  }
};
