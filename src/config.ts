export const SEPOLIA_CHAIN_ID = 11155111;
export const SEPOLIA_HEX_CHAIN_ID = "0xaa36a7";

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

export const APPWRITE_ENDPOINT = readEnv("VITE_APPWRITE_ENDPOINT");
export const APPWRITE_PROJECT_ID = readEnv("VITE_APPWRITE_PROJECT_ID");
export const APPWRITE_DATABASE_ID = readEnv("VITE_APPWRITE_DATABASE_ID");
export const APPWRITE_ANNOUNCEMENTS_COLLECTION_ID = readEnv(
  "VITE_APPWRITE_ANNOUNCEMENTS_COLLECTION_ID",
);
