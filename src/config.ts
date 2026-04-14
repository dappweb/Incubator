export const CNC_MAINNET_CHAIN_ID = 50716;
export const CNC_MAINNET_HEX_CHAIN_ID = "0xc61c";
export const CNC_MAINNET_CHAIN_NAME = "CNC Mainnet";
export const CNC_MAINNET_NATIVE_CURRENCY = {
  name: "CNC",
  symbol: "CNC",
  decimals: 18,
} as const;

const DEFAULT_CNC_MAINNET_RPC_URLS = [
  "https://rpc.cncchainpro.com",
];

type ViteEnvSource = Record<string, string | boolean | undefined>;
const env: ViteEnvSource =
  (typeof import.meta !== "undefined" && (import.meta as { env?: ViteEnvSource }).env) || {};

function readEnv(primaryKey: string, ...fallbackKeys: string[]): string {
  for (const key of [primaryKey, ...fallbackKeys]) {
    const value = env[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return "";
}

function parseRpcUrls(raw: string): string[] {
  if (!raw) return [];

  return raw
    .split(",")
    .map((item) => item.trim())
    .filter((item) => /^https?:\/\//.test(item));
}

function uniqueUrls(urls: string[]): string[] {
  return Array.from(new Set(urls));
}

export const CNC_MAINNET_RPC_URLS = uniqueUrls([
  ...parseRpcUrls(readEnv("VITE_CNC_MAINNET_RPC_URLS", "VITE_CNC_MAINNET_RPCS", "CNC_MAINNET_RPC_URLS")),
  readEnv("VITE_CNC_MAINNET_RPC_URL", "VITE_CNC_MAINNET_RPC", "CNC_MAINNET_RPC_URL"),
  ...DEFAULT_CNC_MAINNET_RPC_URLS,
].filter(Boolean));

export const CNC_MAINNET_RPC_URL =
  CNC_MAINNET_RPC_URLS[0] || "https://rpc.cncchainpro.com";

export const CNC_MAINNET_BLOCK_EXPLORER_URL = readEnv(
  "VITE_CNC_MAINNET_BLOCK_EXPLORER_URL",
  "VITE_CNC_BLOCK_EXPLORER_URL",
  "CNC_MAINNET_BLOCK_EXPLORER_URL",
  "CNC_BLOCK_EXPLORER_URL",
) || "https://cncchainpro.com";

export const USDT_CONTRACT_ADDRESS = readEnv(
  "VITE_USDT_CONTRACT_ADDRESS",
  "VITE_USDT_CONTRACT",
);
export const ICO_TOKEN_ADDRESS = readEnv("VITE_ICO_TOKEN_ADDRESS", "VITE_ICO_TOKEN");
export const LIGHT_TOKEN_ADDRESS = readEnv("VITE_LIGHT_TOKEN_ADDRESS", "VITE_LIGHT_TOKEN");
export const CORE_CONTRACT_ADDRESS = readEnv(
  "VITE_CORE_CONTRACT_ADDRESS",
  "VITE_CORE_CONTRACT",
  "VITE_CORE_CONTRAC",
);
export const OTC_CONTRACT_ADDRESS = readEnv("VITE_OTC_CONTRACT_ADDRESS", "VITE_OTC_CONTRACT");
export const SWAP_POOL_ADDRESS = readEnv("VITE_SWAP_POOL_ADDRESS", "VITE_SWAP_POOL");
export const PANCAKE_V3_ROUTER_ADDRESS = readEnv(
  "VITE_PANCAKE_V2_ROUTER_ADDRESS",
  "VITE_PANCAKE_V3_ROUTER_ADDRESS",
  "VITE_PANCAKE_ROUTER",
);
export const PANCAKE_V3_QUOTER_ADDRESS = readEnv(
  "VITE_PANCAKE_V2_QUOTER_ADDRESS",
  "VITE_PANCAKE_V3_QUOTER_ADDRESS",
  "VITE_PANCAKE_QUOTER",
);
export const PANCAKE_V3_PRIMARY_FEE_PPM = Number(
  readEnv(
    "VITE_PANCAKE_V2_PRIMARY_FEE_PPM",
    "VITE_PANCAKE_V2_FEE_PPM",
    "VITE_PANCAKE_V3_PRIMARY_FEE_PPM",
    "VITE_PANCAKE_V3_FEE_PPM",
  ) || "2500",
);


