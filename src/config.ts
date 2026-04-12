export const BSC_TESTNET_CHAIN_ID = 97;
export const BSC_TESTNET_HEX_CHAIN_ID = "0x61";

type ViteEnvSource = Record<string, string | boolean | undefined>;

const env = import.meta.env as unknown as ViteEnvSource;

function readEnv(primaryKey: string, ...fallbackKeys: string[]): string {
  for (const key of [primaryKey, ...fallbackKeys]) {
    const value = env[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return "";
}

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


