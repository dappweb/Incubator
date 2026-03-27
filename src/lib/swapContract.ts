import { BrowserProvider, Contract } from "ethers";
import { SWAP_POOL_ADDRESS } from "../config";

const swapAbi = [
  "function getPool(uint8 pairId) view returns (address token0,address token1,uint256 reserve0,uint256 reserve1,uint16 feeBps,uint16 maxPriceImpactBps,bool exists)",
  "function quoteExactIn(uint8 pairId, address tokenIn, uint256 amountIn) view returns (uint256 amountOut, uint256 fee, uint256 priceImpactBps)",
  "function swapExactIn(uint8 pairId, address tokenIn, uint256 amountIn, uint256 minOut, address to) returns (uint256 amountOut)",
];

export type SwapPool = {
  token0: string;
  token1: string;
  reserve0: bigint;
  reserve1: bigint;
  feeBps: number;
  maxPriceImpactBps: number;
  exists: boolean;
};

export type SwapQuote = {
  amountOut: bigint;
  fee: bigint;
  priceImpactBps: number;
};

export function getSwapContract(provider: BrowserProvider) {
  if (!SWAP_POOL_ADDRESS) {
    throw new Error("缺少 VITE_SWAP_POOL_ADDRESS 配置");
  }

  return new Contract(SWAP_POOL_ADDRESS, swapAbi, provider);
}

export async function getSwapPool(provider: BrowserProvider, pairId: number): Promise<SwapPool> {
  const contract = getSwapContract(provider) as any;
  const result = await contract.getPool(pairId);
  return {
    token0: result.token0,
    token1: result.token1,
    reserve0: result.reserve0,
    reserve1: result.reserve1,
    feeBps: Number(result.feeBps),
    maxPriceImpactBps: Number(result.maxPriceImpactBps),
    exists: Boolean(result.exists),
  };
}

export async function quoteSwapExactIn(
  provider: BrowserProvider,
  pairId: number,
  tokenIn: string,
  amountIn: bigint,
): Promise<SwapQuote> {
  const contract = getSwapContract(provider) as any;
  const [amountOut, fee, priceImpactBps] = await contract.quoteExactIn(pairId, tokenIn, amountIn);
  return {
    amountOut,
    fee,
    priceImpactBps: Number(priceImpactBps),
  };
}

export async function swapExactIn(
  provider: BrowserProvider,
  pairId: number,
  tokenIn: string,
  amountIn: bigint,
  minOut: bigint,
  to: string,
) {
  const signer = await provider.getSigner();
  const contract = getSwapContract(provider).connect(signer) as any;
  const tx = await contract.swapExactIn(pairId, tokenIn, amountIn, minOut, to);
  return tx.wait();
}
