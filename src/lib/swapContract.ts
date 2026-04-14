import { BrowserProvider, Contract } from "ethers";
import {
    ICO_TOKEN_ADDRESS,
    PANCAKE_V3_PRIMARY_FEE_PPM,
    PANCAKE_V3_ROUTER_ADDRESS,
    SWAP_POOL_ADDRESS,
    USDT_CONTRACT_ADDRESS,
} from "../config";

const swapAbi = [
  "function getPool(uint8 pairId) view returns (address token0,address token1,uint256 reserve0,uint256 reserve1,uint16 feeBps,uint16 maxPriceImpactBps,bool exists)",
  "function quoteExactIn(uint8 pairId, address tokenIn, uint256 amountIn) view returns (uint256 amountOut, uint256 fee, uint256 priceImpactBps)",
  "function swapExactIn(uint8 pairId, address tokenIn, uint256 amountIn, uint256 minOut, address to) returns (uint256 amountOut)",
  "function paused() view returns (bool)",
  "function lightBurnBps() view returns (uint16)",
  "function lightBootstrapBps() view returns (uint16)",
  "function lightNodeBps() view returns (uint16)",
  "function lightSuperNodeBps() view returns (uint16)",
  "function lightBootstrapRecipient() view returns (address)",
  "function lightNodeRecipient() view returns (address)",
  "function lightSuperNodeRecipient() view returns (address)",
  "function feeVault(uint8 pairId, address token) view returns (uint256)",
  "function usdt() view returns (address)",
  "function settleLightFees() external",
  "function updateLightFeeConfig(uint16 burnBps, uint16 bootstrapBps, uint16 nodeBps, uint16 superNodeBps, address bootstrapRecipient, address nodeRecipient, address superNodeRecipient) external",
  "function updatePoolConfig(uint8 pairId, uint16 feeBps, uint16 maxPriceImpactBps) external",
  "function setUsdtAddress(address newUsdtAddress) external",
  "function setPairTokens(uint8 pairId, address token0, address token1) external",
  "function pause() external",
  "function unpause() external",
];

const pancakeRouterV2Abi = [
  "function getAmountsOut(uint256 amountIn, address[] calldata path) external view returns (uint256[] memory amounts)",
  "function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, address[] calldata path, address to, uint256 deadline) external returns (uint256[] memory amounts)",
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

export type PrimarySwapDirection = "forward" | "reverse";

export type LightFeeConfig = {
  burnBps: number;
  bootstrapBps: number;
  nodeBps: number;
  superNodeBps: number;
  bootstrapRecipient: string;
  nodeRecipient: string;
  superNodeRecipient: string;
};

export function getSwapContract(provider: BrowserProvider) {
  if (!SWAP_POOL_ADDRESS) {
    throw new Error("缺少 VITE_SWAP_POOL_ADDRESS 配置");
  }

  return new Contract(SWAP_POOL_ADDRESS, swapAbi, provider);
}

function getPancakeRouterContract(provider: BrowserProvider) {
  if (!PANCAKE_V3_ROUTER_ADDRESS) {
    throw new Error("缺少 VITE_PANCAKE_V2_ROUTER_ADDRESS 配置");
  }

  return new Contract(PANCAKE_V3_ROUTER_ADDRESS, pancakeRouterV2Abi, provider);
}

export function getPrimarySwapSpender() {
  if (!PANCAKE_V3_ROUTER_ADDRESS) {
    throw new Error("缺少 VITE_PANCAKE_V2_ROUTER_ADDRESS 配置");
  }

  return PANCAKE_V3_ROUTER_ADDRESS;
}

export function resolvePrimarySwapTokens(direction: PrimarySwapDirection) {
  if (!USDT_CONTRACT_ADDRESS || !ICO_TOKEN_ADDRESS) {
    throw new Error("缺少 VITE_USDT_CONTRACT_ADDRESS 或 VITE_ICO_TOKEN_ADDRESS 配置");
  }

  return direction === "forward"
    ? { tokenIn: USDT_CONTRACT_ADDRESS, tokenOut: ICO_TOKEN_ADDRESS }
    : { tokenIn: ICO_TOKEN_ADDRESS, tokenOut: USDT_CONTRACT_ADDRESS };
}

export async function quotePrimarySwapExactIn(
  provider: BrowserProvider,
  direction: PrimarySwapDirection,
  amountIn: bigint,
): Promise<SwapQuote> {
  if (amountIn <= 0n) {
    return { amountOut: 0n, fee: 0n, priceImpactBps: 0 };
  }

  const { tokenIn, tokenOut } = resolvePrimarySwapTokens(direction);
  const router = getPancakeRouterContract(provider) as any;
  const feePpm = Number.isFinite(PANCAKE_V3_PRIMARY_FEE_PPM) ? PANCAKE_V3_PRIMARY_FEE_PPM : 2500;
  const path = [tokenIn, tokenOut];
  const amounts = await router.getAmountsOut(amountIn, path);
  const amountOut = Array.isArray(amounts)
    ? amounts[amounts.length - 1]
    : amounts?.[amounts.length - 1];
  const estimatedFee = (amountIn * BigInt(feePpm)) / 1_000_000n;

  return {
    amountOut,
    fee: estimatedFee,
    priceImpactBps: 0,
  };
}

export async function swapPrimaryExactIn(
  provider: BrowserProvider,
  direction: PrimarySwapDirection,
  amountIn: bigint,
  minOut: bigint,
  recipient: string,
) {
  const { tokenIn, tokenOut } = resolvePrimarySwapTokens(direction);
  const signer = await provider.getSigner();
  const router = getPancakeRouterContract(provider).connect(signer) as any;
  const path = [tokenIn, tokenOut];
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 60 * 20);
  const tx = await router.swapExactTokensForTokens(amountIn, minOut, path, recipient, deadline);
  return tx.wait();
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

export async function isSwapPaused(provider: BrowserProvider): Promise<boolean> {
  const contract = getSwapContract(provider) as any;
  return contract.paused();
}

export async function getLightFeeConfig(provider: BrowserProvider): Promise<LightFeeConfig> {
  const contract = getSwapContract(provider) as any;
  const [burnBps, bootstrapBps, nodeBps, superNodeBps, bootstrapRecipient, nodeRecipient, superNodeRecipient] = await Promise.all([
    contract.lightBurnBps(),
    contract.lightBootstrapBps(),
    contract.lightNodeBps(),
    contract.lightSuperNodeBps(),
    contract.lightBootstrapRecipient(),
    contract.lightNodeRecipient(),
    contract.lightSuperNodeRecipient(),
  ]);
  return {
    burnBps: Number(burnBps),
    bootstrapBps: Number(bootstrapBps),
    nodeBps: Number(nodeBps),
    superNodeBps: Number(superNodeBps),
    bootstrapRecipient: bootstrapRecipient as string,
    nodeRecipient: nodeRecipient as string,
    superNodeRecipient: superNodeRecipient as string,
  };
}

export async function getSwapFeeVault(provider: BrowserProvider, pairId: number, token: string): Promise<bigint> {
  const contract = getSwapContract(provider) as any;
  return contract.feeVault(pairId, token);
}

export async function settleLightFees(provider: BrowserProvider) {
  const signer = await provider.getSigner();
  const contract = getSwapContract(provider).connect(signer) as any;
  const tx = await contract.settleLightFees();
  return tx.wait();
}

export async function updateSwapLightFeeConfig(provider: BrowserProvider, config: LightFeeConfig) {
  const signer = await provider.getSigner();
  const contract = getSwapContract(provider).connect(signer) as any;
  const tx = await contract.updateLightFeeConfig(
    config.burnBps,
    config.bootstrapBps,
    config.nodeBps,
    config.superNodeBps,
    config.bootstrapRecipient,
    config.nodeRecipient,
    config.superNodeRecipient,
  );
  return tx.wait();
}

export async function updateSwapPoolConfig(provider: BrowserProvider, pairId: number, feeBps: number, maxPriceImpactBps: number) {
  const signer = await provider.getSigner();
  const contract = getSwapContract(provider).connect(signer) as any;
  const tx = await contract.updatePoolConfig(pairId, feeBps, maxPriceImpactBps);
  return tx.wait();
}

export async function pauseSwap(provider: BrowserProvider) {
  const signer = await provider.getSigner();
  const contract = getSwapContract(provider).connect(signer) as any;
  const tx = await contract.pause();
  return tx.wait();
}

export async function unpauseSwap(provider: BrowserProvider) {
  const signer = await provider.getSigner();
  const contract = getSwapContract(provider).connect(signer) as any;
  const tx = await contract.unpause();
  return tx.wait();
}

/** 批量读取两个交易池的储备量，返回数据供首页展示 */
export async function getSwapPoolsInfo(provider: BrowserProvider): Promise<{
  primaryPool: SwapPool;   // pairId 0: USDT/ICO
  lightPool: SwapPool;     // pairId 1: LIGHT/ICO
}> {
  const contract = getSwapContract(provider) as any;
  const [r0, r1] = await Promise.all([
    contract.getPool(0),
    contract.getPool(1),
  ]);
  const parse = (r: any): SwapPool => ({
    token0: r.token0,
    token1: r.token1,
    reserve0: r.reserve0,
    reserve1: r.reserve1,
    feeBps: Number(r.feeBps),
    maxPriceImpactBps: Number(r.maxPriceImpactBps),
    exists: Boolean(r.exists),
  });
  return { primaryPool: parse(r0), lightPool: parse(r1) };
}

export async function getUsdtAddress(provider: BrowserProvider): Promise<string> {
  const contract = getSwapContract(provider) as any;
  return contract.usdt();
}

export async function setUsdtAddress(provider: BrowserProvider, newUsdtAddress: string) {
  const signer = await provider.getSigner();
  const contract = getSwapContract(provider).connect(signer) as any;
  const tx = await contract.setUsdtAddress(newUsdtAddress);
  return tx.wait();
}

export async function setPairTokens(provider: BrowserProvider, pairId: number, token0: string, token1: string) {
  const signer = await provider.getSigner();
  const contract = getSwapContract(provider).connect(signer) as any;
  const tx = await contract.setPairTokens(pairId, token0, token1);
  return tx.wait();
}
