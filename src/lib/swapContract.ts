import { AbstractSigner, BrowserProvider, Contract } from "ethers";
import {
    ICO_TOKEN_ADDRESS,
    PANCAKE_V2_FACTORY_ADDRESS,
    PANCAKE_V3_PRIMARY_FEE_PPM,
    PANCAKE_V3_ROUTER_ADDRESS,
    PRIMARY_SWAP_CONTROLLER_ADDRESS,
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
  "function addLiquidity(uint8 pairId, uint256 amount0, uint256 amount1) external",
  "function removeLiquidity(uint8 pairId, uint256 amount0, uint256 amount1, address to) external",
  "function distributeFees(uint8 pairId, address token, address[] recipients, uint16[] bps) external",
  "function createDefaultPools(uint16 feeBpsUsdtIco, uint16 feeBpsLightIco, uint16 maxPriceImpactBps) external",
  "function cycleDuration() view returns (uint256)",
  "function setCycleDuration(uint256 newDuration) external",
];

const pancakeRouterV2Abi = [
  "function getAmountsOut(uint256 amountIn, address[] calldata path) external view returns (uint256[] memory amounts)",
  "function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, address[] calldata path, address to, uint256 deadline) external returns (uint256[] memory amounts)",
];

const pancakeFactoryAbi = [
  "function getPair(address tokenA, address tokenB) view returns (address pair)",
];

const pancakePairAbi = [
  "function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)",
  "function token0() view returns (address)",
  "function token1() view returns (address)",
];

const primarySwapControllerAbi = [
  "function buyFeeBps() view returns (uint16)",
  "function sellFeeBps() view returns (uint16)",
  "function superNodeFeeBps() view returns (uint16)",
  "function nodePoolFeeBps() view returns (uint16)",
  "function platformFeeBps() view returns (uint16)",
  "function sellBurnBps() view returns (uint16)",
  "function sellPlatformIcoBps() view returns (uint16)",
  "function sellLiquidityIcoBps() view returns (uint16)",
  "function sellUsdtEnabled() view returns (bool)",
  "function minUsdtReserveToEnableSell() view returns (uint256)",
  "function minIcoHolderCountToEnableSell() view returns (uint256)",
  "function reportedIcoHolderCount() view returns (uint256)",
  "function superNodeFeeRecipient() view returns (address)",
  "function nodePoolFeeRecipient() view returns (address)",
  "function platformRecipient() view returns (address)",
  "function pair() view returns (address)",
  "function quoteBuyIco(uint256 amountInUsdt) view returns (uint256 amountOutIco, uint256 feeUsdt)",
  "function quoteSellIco(uint256 amountInIco) view returns (uint256 amountOutUsdt, uint256 feeUsdt, uint256 burnAmountIco, uint256 platformAmountIco, uint256 liquidityAmountIco)",
  "function buyIcoExactIn(uint256 amountInUsdt, uint256 minOutIco, address recipient) returns (uint256 amountOutIco)",
  "function sellIcoForUsdt(uint256 amountInIco, uint256 minOutUsdt, address recipient) returns (uint256 amountOutUsdt)",
  "function updateBuyFeeConfig(uint16 newBuyFeeBps, uint16 newSuperNodeFeeBps, uint16 newNodePoolFeeBps, uint16 newPlatformFeeBps) external",
  "function updateSellConfig(uint16 newSellFeeBps, uint16 newSellBurnBps, uint16 newSellPlatformIcoBps, uint16 newSellLiquidityIcoBps) external",
  "function updateRecipients(address superNode, address nodePool, address platform) external",
  "function updateThresholds(uint256 newMinUsdtReserve, uint256 newMinIcoHolderCount) external",
  "function enableSellUsdt() external",
  "function disableSellUsdt() external",
  "function reportIcoHolderCount(uint256 holderCount) external",
  "function updatePair(address newPair) external",
  "function withdrawTreasury(address token, address to, uint256 amount) external",
  "function canEnableSellUsdt() view returns (bool)",
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

function getPrimarySwapController(provider: BrowserProvider) {
  if (!PRIMARY_SWAP_CONTROLLER_ADDRESS) {
    throw new Error("缺少 VITE_PRIMARY_SWAP_CONTROLLER_ADDRESS 配置");
  }

  return new Contract(PRIMARY_SWAP_CONTROLLER_ADDRESS, primarySwapControllerAbi, provider);
}

function hasPrimarySwapController() {
  return Boolean(PRIMARY_SWAP_CONTROLLER_ADDRESS);
}

export function getPrimarySwapSpender() {
  if (PRIMARY_SWAP_CONTROLLER_ADDRESS) {
    return PRIMARY_SWAP_CONTROLLER_ADDRESS;
  }

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

  if (hasPrimarySwapController()) {
    const controller = getPrimarySwapController(provider) as any;
    if (direction === "forward") {
      const [amountOut, fee] = await controller.quoteBuyIco(amountIn);
      const priceImpactBps = await _estimatePrimaryImpact(provider, direction, amountIn, fee);
      return { amountOut, fee, priceImpactBps };
    }

    const sellUsdtEnabled = Boolean(await controller.sellUsdtEnabled());
    if (!sellUsdtEnabled) {
      return { amountOut: 0n, fee: 0n, priceImpactBps: 0 };
    }

    const [amountOut, fee, , , liquidityAmountIco] = await controller.quoteSellIco(amountIn);
    const priceImpactBps = await _estimatePrimaryImpactSell(provider, liquidityAmountIco);
    return { amountOut, fee, priceImpactBps };
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
  signer?: AbstractSigner,
) {
  if (hasPrimarySwapController()) {
    if (!signer) signer = await provider.getSigner();
    const controller = getPrimarySwapController(provider).connect(signer) as any;
    const tx = direction === "forward"
      ? await controller.buyIcoExactIn(amountIn, minOut, recipient, { gasLimit: 700_000n })
      : await controller.sellIcoForUsdt(amountIn, minOut, recipient, { gasLimit: 900_000n });
    return tx.wait();
  }

  const { tokenIn, tokenOut } = resolvePrimarySwapTokens(direction);
  if (!signer) signer = await provider.getSigner();
  const router = getPancakeRouterContract(provider).connect(signer) as any;
  const path = [tokenIn, tokenOut];
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 60 * 20);
  const tx = await router.swapExactTokensForTokens(amountIn, minOut, path, recipient, deadline, { gasLimit: 500_000n });
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

export async function getPrimarySwapFeeBps(provider: BrowserProvider, direction: PrimarySwapDirection): Promise<number> {
  if (hasPrimarySwapController()) {
    const controller = getPrimarySwapController(provider) as any;
    return Number(direction === "forward" ? await controller.buyFeeBps() : await controller.sellFeeBps());
  }

  return Math.floor(PANCAKE_V3_PRIMARY_FEE_PPM / 100);
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
  signer?: AbstractSigner,
) {
  if (!signer) signer = await provider.getSigner();
  const contract = getSwapContract(provider).connect(signer) as any;
  const tx = await contract.swapExactIn(pairId, tokenIn, amountIn, minOut, to, { gasLimit: 500_000n });
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

/** 从 PancakeV2 pair 读取 USDT/ICO 储备量 */
export async function getPancakeV2PrimaryReserves(provider: BrowserProvider): Promise<SwapPool> {
  const empty: SwapPool = { token0: "", token1: "", reserve0: 0n, reserve1: 0n, feeBps: 0, maxPriceImpactBps: 0, exists: false };
  if (!PANCAKE_V2_FACTORY_ADDRESS || !USDT_CONTRACT_ADDRESS || !ICO_TOKEN_ADDRESS) {
    return empty;
  }

  try {
    const factory = new Contract(PANCAKE_V2_FACTORY_ADDRESS, pancakeFactoryAbi, provider as any);
    const pairAddr: string = await (factory as any).getPair(USDT_CONTRACT_ADDRESS, ICO_TOKEN_ADDRESS);
    if (!pairAddr || pairAddr === "0x0000000000000000000000000000000000000000") {
      return empty;
    }

    const pair = new Contract(pairAddr, pancakePairAbi, provider as any);
    const [token0, reserves] = await Promise.all([
      (pair as any).token0() as Promise<string>,
      (pair as any).getReserves(),
    ]);

    const isToken0Usdt = token0.toLowerCase() === USDT_CONTRACT_ADDRESS.toLowerCase();
    return {
      token0: isToken0Usdt ? USDT_CONTRACT_ADDRESS : ICO_TOKEN_ADDRESS,
      token1: isToken0Usdt ? ICO_TOKEN_ADDRESS : USDT_CONTRACT_ADDRESS,
      reserve0: isToken0Usdt ? BigInt(reserves[0]) : BigInt(reserves[1]),
      reserve1: isToken0Usdt ? BigInt(reserves[1]) : BigInt(reserves[0]),
      feeBps: Math.floor(PANCAKE_V3_PRIMARY_FEE_PPM / 100),
      maxPriceImpactBps: 0,
      exists: true,
    };
  } catch (e) {
    console.error("getPancakeV2PrimaryReserves failed", e);
    return empty;
  }
}

/** 批量读取交易池储备量，返回数据供首页展示。
 *  primaryPool (USDT/ICO) 使用 PancakeV2 pair 数据；
 *  lightPool (LIGHT/ICO) 使用 SwapPoolManager 内部池。 */
export async function getSwapPoolsInfo(provider: BrowserProvider): Promise<{
  primaryPool: SwapPool;   // PancakeV2 USDT/ICO pair
  lightPool: SwapPool;     // pairId 1: LIGHT/ICO (SwapPoolManager)
}> {
  const emptyPool: SwapPool = { token0: "", token1: "", reserve0: 0n, reserve1: 0n, feeBps: 0, maxPriceImpactBps: 0, exists: false };
  const [primaryPool, lightPool] = await Promise.all([
    getPancakeV2PrimaryReserves(provider).catch(() => emptyPool),
    (async () => {
      try {
        const contract = getSwapContract(provider) as any;
        const r = await contract.getPool(1);
        return {
          token0: r.token0 as string, token1: r.token1 as string,
          reserve0: r.reserve0 as bigint, reserve1: r.reserve1 as bigint,
          feeBps: Number(r.feeBps), maxPriceImpactBps: Number(r.maxPriceImpactBps),
          exists: Boolean(r.exists),
        } as SwapPool;
      } catch { return emptyPool; }
    })(),
  ]);
  return { primaryPool, lightPool };
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

/**
 * Estimate real AMM price impact for a buy (USDT→ICO) through PrimarySwapController.
 * Compare marginal rate (tiny quote) with execution rate for the actual net amount.
 */
async function _estimatePrimaryImpact(
  provider: BrowserProvider,
  direction: PrimarySwapDirection,
  amountIn: bigint,
  fee: bigint,
): Promise<number> {
  try {
    const router = getPancakeRouterContract(provider) as any;
    const { tokenIn, tokenOut } = resolvePrimarySwapTokens(direction);
    const path = [tokenIn, tokenOut];
    const netIn = amountIn - fee;
    if (netIn <= 0n) return 0;

    // Marginal rate from a tiny amount (1 unit ≈ smallest meaningful amount)
    const spotUnit = netIn < 1_000_000n ? netIn / 100n || 1n : 1_000_000n;
    const [, spotOut] = await router.getAmountsOut(spotUnit, path);
    if (spotOut <= 0n) return 0;

    const [, actualOut] = await router.getAmountsOut(netIn, path);
    if (actualOut <= 0n) return 0;

    // impact = 1 - (actualOut / netIn) / (spotOut / spotUnit)
    //        = 1 - (actualOut * spotUnit) / (spotOut * netIn)
    const numerator = actualOut * spotUnit * 10_000n;
    const denominator = spotOut * netIn;
    if (denominator === 0n) return 0;
    const ratioBps = numerator / denominator;
    const impact = 10_000n - ratioBps;
    return impact > 0n ? Number(impact) : 0;
  } catch {
    return 0;
  }
}

/**
 * Estimate real AMM price impact for a sell (ICO→USDT) through PrimarySwapController.
 * `liquidityAmountIco` is the portion actually swapped on DEX (after burn + platform split).
 */
async function _estimatePrimaryImpactSell(
  provider: BrowserProvider,
  liquidityAmountIco: bigint,
): Promise<number> {
  try {
    if (liquidityAmountIco <= 0n) return 0;
    const router = getPancakeRouterContract(provider) as any;
    const path = [ICO_TOKEN_ADDRESS, USDT_CONTRACT_ADDRESS];

    const spotUnit = liquidityAmountIco < 1_000_000_000_000_000_000n
      ? liquidityAmountIco / 100n || 1n
      : 1_000_000_000_000_000_000n; // 1 ICO (18 dec)
    const [, spotOut] = await router.getAmountsOut(spotUnit, path);
    if (spotOut <= 0n) return 0;

    const [, actualOut] = await router.getAmountsOut(liquidityAmountIco, path);
    if (actualOut <= 0n) return 0;

    const numerator = actualOut * spotUnit * 10_000n;
    const denominator = spotOut * liquidityAmountIco;
    if (denominator === 0n) return 0;
    const ratioBps = numerator / denominator;
    const impact = 10_000n - ratioBps;
    return impact > 0n ? Number(impact) : 0;
  } catch {
    return 0;
  }
}

// ── SwapPoolManager liquidity & fee distribution ──

export async function addSwapLiquidity(provider: BrowserProvider, pairId: number, amount0: bigint, amount1: bigint) {
  const signer = await provider.getSigner();
  const contract = getSwapContract(provider).connect(signer) as any;
  const tx = await contract.addLiquidity(pairId, amount0, amount1, { gasLimit: 500_000n });
  return tx.wait();
}

export async function removeSwapLiquidity(provider: BrowserProvider, pairId: number, amount0: bigint, amount1: bigint, to: string) {
  const signer = await provider.getSigner();
  const contract = getSwapContract(provider).connect(signer) as any;
  const tx = await contract.removeLiquidity(pairId, amount0, amount1, to, { gasLimit: 500_000n });
  return tx.wait();
}

export async function distributeSwapFees(provider: BrowserProvider, pairId: number, token: string, recipients: string[], bps: number[]) {
  const signer = await provider.getSigner();
  const contract = getSwapContract(provider).connect(signer) as any;
  const tx = await contract.distributeFees(pairId, token, recipients, bps, { gasLimit: 1_000_000n });
  return tx.wait();
}

export async function createDefaultPools(provider: BrowserProvider, feeBpsUsdtIco: number, feeBpsLightIco: number, maxImpactBps: number) {
  const signer = await provider.getSigner();
  const contract = getSwapContract(provider).connect(signer) as any;
  const tx = await contract.createDefaultPools(feeBpsUsdtIco, feeBpsLightIco, maxImpactBps);
  return tx.wait();
}

// ── PrimarySwapController admin functions ──

export type PrimarySwapConfig = {
  buyFeeBps: number; sellFeeBps: number; superNodeFeeBps: number;
  nodePoolFeeBps: number; platformFeeBps: number; sellBurnBps: number;
  sellPlatformIcoBps: number; sellLiquidityIcoBps: number; sellUsdtEnabled: boolean;
  minUsdtReserve: bigint; minIcoHolderCount: bigint; reportedIcoHolderCount: bigint;
  superNodeFeeRecipient: string; nodePoolFeeRecipient: string; platformRecipient: string;
  pair: string; canEnableSell: boolean;
};

export async function getPrimarySwapConfig(provider: BrowserProvider): Promise<PrimarySwapConfig> {
  const c = getPrimarySwapController(provider) as any;
  const [a, b, c2, d, e, f, g, h, i, j, k, l, m, n, o, p] = await Promise.all([
    c.buyFeeBps(), c.sellFeeBps(), c.superNodeFeeBps(), c.nodePoolFeeBps(), c.platformFeeBps(),
    c.sellBurnBps(), c.sellPlatformIcoBps(), c.sellLiquidityIcoBps(),
    c.sellUsdtEnabled(), c.minUsdtReserveToEnableSell(), c.minIcoHolderCountToEnableSell(),
    c.reportedIcoHolderCount(), c.superNodeFeeRecipient(), c.nodePoolFeeRecipient(),
    c.platformRecipient(), c.pair(),
  ]);
  let canEnableSell = false;
  try { canEnableSell = Boolean(await c.canEnableSellUsdt()); } catch { /* noop */ }
  return {
    buyFeeBps: Number(a), sellFeeBps: Number(b), superNodeFeeBps: Number(c2),
    nodePoolFeeBps: Number(d), platformFeeBps: Number(e), sellBurnBps: Number(f),
    sellPlatformIcoBps: Number(g), sellLiquidityIcoBps: Number(h),
    sellUsdtEnabled: Boolean(i), minUsdtReserve: j as bigint, minIcoHolderCount: k as bigint,
    reportedIcoHolderCount: l as bigint, superNodeFeeRecipient: m as string,
    nodePoolFeeRecipient: n as string, platformRecipient: o as string, pair: p as string,
    canEnableSell,
  };
}

export async function updatePrimaryBuyFeeConfig(provider: BrowserProvider, buyBps: number, superBps: number, nodeBps: number, platBps: number) {
  const signer = await provider.getSigner();
  const c = getPrimarySwapController(provider).connect(signer) as any;
  return (await c.updateBuyFeeConfig(buyBps, superBps, nodeBps, platBps)).wait();
}

export async function updatePrimarySellConfig(provider: BrowserProvider, sellBps: number, burnBps: number, platIcoBps: number, liqIcoBps: number) {
  const signer = await provider.getSigner();
  const c = getPrimarySwapController(provider).connect(signer) as any;
  return (await c.updateSellConfig(sellBps, burnBps, platIcoBps, liqIcoBps)).wait();
}

export async function updatePrimaryRecipients(provider: BrowserProvider, superNode: string, nodePool: string, platform: string) {
  const signer = await provider.getSigner();
  const c = getPrimarySwapController(provider).connect(signer) as any;
  return (await c.updateRecipients(superNode, nodePool, platform)).wait();
}

export async function updatePrimaryThresholds(provider: BrowserProvider, minReserve: bigint, minHolders: bigint) {
  const signer = await provider.getSigner();
  const c = getPrimarySwapController(provider).connect(signer) as any;
  return (await c.updateThresholds(minReserve, minHolders)).wait();
}

export async function enableSellUsdt(provider: BrowserProvider) {
  const signer = await provider.getSigner();
  return (await (getPrimarySwapController(provider).connect(signer) as any).enableSellUsdt()).wait();
}

export async function disableSellUsdt(provider: BrowserProvider) {
  const signer = await provider.getSigner();
  return (await (getPrimarySwapController(provider).connect(signer) as any).disableSellUsdt()).wait();
}

export async function reportIcoHolderCount(provider: BrowserProvider, count: bigint) {
  const signer = await provider.getSigner();
  return (await (getPrimarySwapController(provider).connect(signer) as any).reportIcoHolderCount(count)).wait();
}

export async function updatePrimaryPair(provider: BrowserProvider, newPair: string) {
  const signer = await provider.getSigner();
  return (await (getPrimarySwapController(provider).connect(signer) as any).updatePair(newPair)).wait();
}

export async function withdrawPrimaryTreasury(provider: BrowserProvider, token: string, to: string, amount: bigint) {
  const signer = await provider.getSigner();
  return (await (getPrimarySwapController(provider).connect(signer) as any).withdrawTreasury(token, to, amount)).wait();
}

export async function getSwapCycleDuration(provider: BrowserProvider): Promise<bigint> {
  const contract = getSwapContract(provider);
  return contract.cycleDuration() as Promise<bigint>;
}

export async function setSwapCycleDuration(provider: BrowserProvider, durationSeconds: bigint) {
  const signer = await provider.getSigner();
  const contract = getSwapContract(provider).connect(signer) as any;
  const tx = await contract.setCycleDuration(durationSeconds);
  return tx.wait();
}
