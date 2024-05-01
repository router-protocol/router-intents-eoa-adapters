/* eslint-disable node/no-unsupported-features/es-syntax */
import { Percent, Token } from "@uniswap/sdk-core";
import { abi as IUniswapV3PoolABI } from "@uniswap/v3-core/artifacts/contracts/interfaces/IUniswapV3Pool.sol/IUniswapV3Pool.json";
import {
  FeeAmount,
  Pool,
  Position,
  TICK_SPACINGS,
  computePoolAddress,
  nearestUsableTick,
} from "@uniswap/v3-sdk";
import { Contract, Wallet } from "ethers";
import { TokenInterface__factory } from "../../typechain/factories/TokenInterface__factory";

const UNISWAP_V3_FACTORY: { [chainId: string]: string } = {
  "80001": "0x1F98431c8aD98523631AE4a59f267346ea31F984",
  "5": "0x1F98431c8aD98523631AE4a59f267346ea31F984",
};

interface PoolDataResponse {
  pool: string;
  token0: Token;
  token1: Token;
  tick: number;
  sqrtPriceX96: string;
  liquidity: string;
  initialized?: boolean;
}

export const getPoolData = async (
  user: Wallet,
  chainId: string,
  token0: string,
  token1: string,
  fee: number
): Promise<PoolDataResponse> => {
  const provider = user.provider;
  const tokenAAddress = token0;
  const tokenBAddress = token1;
  const poolFee = fee;

  const factoryAddress = UNISWAP_V3_FACTORY[chainId];

  const tokenAContract = TokenInterface__factory.connect(token0, user);
  const tokenBContract = TokenInterface__factory.connect(token1, user);

  const [tokenADecimals, tokenBDecimals] = await Promise.all([
    tokenAContract.decimals(),
    tokenBContract.decimals(),
  ]);

  const tokenA = new Token(
    Number(chainId),
    tokenAAddress,
    Number(tokenADecimals)
  );
  const tokenB = new Token(
    Number(chainId),
    tokenBAddress,
    Number(tokenBDecimals)
  );

  let uniToken0: Token, uniToken1: Token;
  if (tokenA.sortsBefore(tokenB)) {
    uniToken0 = tokenA;
    uniToken1 = tokenB;
  } else {
    uniToken0 = tokenB;
    uniToken1 = tokenA;
  }

  const currentPoolAddress = computePoolAddress({
    factoryAddress,
    tokenA: uniToken0,
    tokenB: uniToken1,
    fee: poolFee,
  });

  const poolContract = new Contract(
    currentPoolAddress,
    IUniswapV3PoolABI,
    provider
  );

  const code = await provider.getCode(currentPoolAddress);
  if (code === "0x" || !code) {
    return {
      pool: currentPoolAddress,
      token0: uniToken0,
      token1: uniToken1,
      tick: 0,
      sqrtPriceX96: "0",
      liquidity: "0",
      initialized: false,
    };
  }

  const [liquidity, slot0] = await Promise.all([
    poolContract.liquidity(),
    poolContract.slot0(),
  ]);

  return {
    pool: currentPoolAddress,
    token0: uniToken0,
    token1: uniToken1,
    tick: Number(slot0.tick),
    sqrtPriceX96: slot0.sqrtPriceX96.toString(),
    liquidity: liquidity.toString(),
    initialized: true,
  };
};

const getPool = async (
  token0: Token,
  token1: Token,
  poolFee: FeeAmount,
  poolAddress: string,
  user: Wallet
) => {
  const provider = user.provider;
  // get liquidity, tick, sqrtPriceX96, fee, token0, token1
  const poolContract = new Contract(poolAddress, IUniswapV3PoolABI, user);

  let liquidity, slot0;

  const code = await provider.getCode(poolAddress);
  if (code === "0x" || !code) {
    liquidity = 0n;
    slot0 = {
      tick: 0,
      sqrtPriceX96: 0n,
    };
  } else {
    [liquidity, slot0] = await Promise.all([
      poolContract.liquidity(),
      poolContract.slot0(),
    ]);
  }

  liquidity = liquidity.toString();
  const sqrtPriceX96: string = slot0.sqrtPriceX96.toString();

  const tick = Number(slot0.tick);

  return new Pool(token0, token1, poolFee, sqrtPriceX96, liquidity, tick);
};

export const getUniswapV3Data = async (data: {
  user: Wallet;
  chainId: string;
  token0: string;
  token1: string;
  amount0: string;
  amount1: string;
  fee: number;
  deadline?: number;
}) => {
  const {
    pool: poolAddress,
    token0,
    token1,
    tick,
  } = await getPoolData(
    data.user,
    data.chainId,
    data.token0,
    data.token1,
    data.fee
  );

  const poolFee = data.fee as FeeAmount;
  const tickSpacing = TICK_SPACINGS[poolFee];
  const tickLower = nearestUsableTick(tick - 10000, tickSpacing);
  const tickUpper = nearestUsableTick(tick + 10000, tickSpacing);

  const pool = await getPool(token0, token1, data.fee, poolAddress, data.user);

  // const position = Position.fromAmounts({
  //   pool,
  //   tickLower: tickLower,
  //   tickUpper: tickUpper,
  //   amount0: ethers.utils.parseEther("100000000").toString(),
  //   amount1: ethers.utils.parseEther("100000000").toString(),
  //   useFullPrecision: true,
  // });
  const position = Position.fromAmount0({
    pool,
    tickLower: tickLower,
    tickUpper: tickUpper,
    amount0: data.amount0.toString(),
    useFullPrecision: true,
  });

  // get token0 amount and token1 amount. calculate ratio of token0 and token1
  const token0Amount = position.mintAmounts.amount0;
  const token1Amount = position.mintAmounts.amount1;

  // Current price is out of range of tickLower and tickUpper
  if (token0Amount.toString() === "0" || token1Amount.toString() === "0") {
    throw new Error("Price out of range");
  } else {
    const minPosition = Position.fromAmounts({
      pool,
      tickLower: tickLower,
      tickUpper: tickUpper,
      amount0: data.amount0,
      amount1: data.amount1,
      useFullPrecision: true,
    });

    const minOutputAmounts = minPosition.mintAmounts;
    const minOutputAmountsWithSlippage = minPosition.mintAmountsWithSlippage(
      new Percent(1, 100)
    );

    return {
      token0: token0.address,
      token1: token1.address,
      fee: poolFee,
      tickLower: tickLower,
      tickUpper: tickUpper,
      amount0Desired: minOutputAmounts.amount0.toString(),
      amount1Desired: minOutputAmounts.amount1.toString(),
      amount0Min: minOutputAmountsWithSlippage.amount0.toString(),
      amount1Min: minOutputAmountsWithSlippage.amount1.toString(),
      recipient: data.user.address,
      deadline: data.deadline
        ? data.deadline
        : Math.floor(Date.now() / 1000) + 60 * 20,
    };
  }
};
