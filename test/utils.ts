/* eslint-disable node/no-unsupported-features/es-syntax */
import axios from "axios";
import { defaultAbiCoder } from "ethers/lib/utils";
import { NATIVE } from "../tasks/constants";
import { ContractReceipt, ethers } from "ethers";

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

export const decodeUnsupportedOperationEvent = (
  txReceipt: ContractReceipt
): { token: string; refundAddress: string; refundAmount: string } => {
  const EventInterface = new ethers.utils.Interface([
    "event UnsupportedOperation(address token,address refundAddress,uint256 amount)",
  ]);

  const unsupportedOperationEvent = txReceipt.logs.filter(
    (_log: any) =>
      _log.topics[0] === EventInterface.getEventTopic("UnsupportedOperation")
  );

  const eventData = EventInterface.decodeEventLog(
    "UnsupportedOperation",
    unsupportedOperationEvent[0].data,
    unsupportedOperationEvent[0].topics
  );

  const [token, refundAddress, refundAmount] = [
    eventData[0],
    eventData[1],
    eventData[2],
  ];

  return { token, refundAddress, refundAmount };
};

export const decodeExecutionEvent = (
  txReceipt: ContractReceipt
): { name: string; data: string } => {
  const EventInterface = new ethers.utils.Interface([
    "event ExecutionEvent(string indexed adapterName, bytes data)",
  ]);

  const executionEvent = txReceipt.logs.filter(
    (_log: any) =>
      _log.topics[0] === EventInterface.getEventTopic("ExecutionEvent")
  );

  const eventData = EventInterface.decodeEventLog(
    "ExecutionEvent",
    executionEvent[0].data,
    executionEvent[0].topics
  );

  // name is the hash of the string passed on the contract
  // example: for UniswapV3Mint adapter, name is keccak256("UniswapV3Mint")
  return { name: eventData[0], data: eventData[1] };
};
