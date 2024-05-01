/* eslint-disable node/no-unsupported-features/es-syntax */
import axios from "axios";
import { defaultAbiCoder } from "ethers/lib/utils";
import { NATIVE } from "../tasks/constants";
import { ContractReceipt, ethers, Wallet } from "ethers";

const PATH_FINDER_API_URL =
  "https://api-beta.pathfinder.routerprotocol.com/api";

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
    slippageTolerance: 10,
  };

  const quoteData = await getQuote(quoteParams);

  if (toTokenAddress === NATIVE && fromTokenChainId === toTokenChainId) {
    quoteData.source.path[quoteData.source.path.length - 1] = NATIVE;
  }

  if (fromTokenAddress === NATIVE) {
    quoteData.source.path[0] = NATIVE;
  }

  const swapParamsIface =
    "tuple(address[] tokens,uint256 widgetId,uint256 amount,uint256 minReturn,uint256[] flags,bytes[] dataTx,address recipient) SwapParams";

  const data = defaultAbiCoder.encode(
    [swapParamsIface],
    [
      {
        tokens: quoteData?.source?.path,
        widgetId: 0,
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

export const getTransaction = async (params: any) => {
  const quote = await getQuote({
    fromTokenAddress: params.fromTokenAddress,
    toTokenAddress: params.toTokenAddress,
    amount: params.amount,
    fromTokenChainId: params.fromTokenChainId,
    toTokenChainId: params.toTokenChainId,
  });

  const txEndpoint = "v2/transaction";
  const txUrl = `${PATH_FINDER_API_URL}/${txEndpoint}`;
  const txParams = {
    ...quote,
    senderAddress: params.senderAddress,
    receiverAddress: params.receiverAddress,
  };

  const txData = await axios.post(txUrl, txParams);
  // console.log(txData);
  return txData.data.txn;
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

getTransaction({
  fromTokenAddress: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
  toTokenAddress: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
  amount: "10000000000000000",
  fromTokenChainId: "8453",
  toTokenChainId: "8453",
  senderAddress: "0xB8FF877ed78Ba520Ece21B1de7843A8a57cA47Cb",
  receiverAddress: "0xB8FF877ed78Ba520Ece21B1de7843A8a57cA47Cb",
});

// getTransaction({
//   fromTokenAddress: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
//   toTokenAddress: "0x9c2C5fd7b07E95EE044DDeba0E97a665F142394f",
//   amount: "10000000000000000",
//   fromTokenChainId: "1",
//   toTokenChainId: "137",
//   senderAddress: "0xE95cCdd0e189e5617561c867281B10761Bf85413",
//   receiverAddress: "0xE95cCdd0e189e5617561c867281B10761Bf85413",
// });

export async function signPermitWithDomain(
  signer: Wallet,
  domain: {
    name: string;
    version: string;
    chainId: string;
    verifyingContract: string;
  },
  values: {
    owner: string;
    spender: string;
    value: string;
    nonce: string;
    deadline: string;
  }
) {
  const types = {
    Permit: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
      { name: "value", type: "uint256" },
      { name: "nonce", type: "uint256" },
      { name: "deadline", type: "uint256" },
    ],
  };

  const signature = await signer._signTypedData(domain, types, values);

  const r = "0x" + signature.substring(2).substring(0, 64);
  const s = "0x" + signature.substring(2).substring(64, 128);
  const v = parseInt(signature.substring(2).substring(128, 130), 16);

  return { v, r, s };
}
