import { BrowserProvider, Contract } from "ethers";
import { SWAP_POOL_ADDRESS } from "../config";

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
  "function settleLightFees() external",
  "function updateLightFeeConfig(uint16 burnBps, uint16 bootstrapBps, uint16 nodeBps, uint16 superNodeBps, address bootstrapRecipient, address nodeRecipient, address superNodeRecipient) external",
  "function updatePoolConfig(uint8 pairId, uint16 feeBps, uint16 maxPriceImpactBps) external",
  "function pause() external",
  "function unpause() external",
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
