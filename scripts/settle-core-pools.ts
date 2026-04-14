import * as dotenv from "dotenv";
import { ethers } from "hardhat";

dotenv.config({ path: ".env" });

const coreAbi = [
  "function poolAccumulated(uint8 poolType) view returns (uint256)",
  "function settleNodeRewards(address[] recipients, uint16[] shares) external",
  "function settleSuperNodeRewards(address[] recipients, uint16[] shares) external",
  "function settleLeaderboard(uint256 dayId) external",
  "function paused() view returns (bool)",
];

const POOL_SUPER_NODE = 2;
const POOL_NODE = 3;
const POOL_LEADERBOARD = 5;
const BPS_TOTAL = 10_000;

function readEnv(...keys: string[]) {
  for (const key of keys) {
    const value = process.env[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return "";
}

function parseAddressList(raw: string): string[] {
  if (!raw) return [];

  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseShareList(raw: string): number[] {
  if (!raw) return [];

  return raw
    .split(",")
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isFinite(item));
}

function validateShares(shares: number[]) {
  if (shares.length === 0) {
    throw new Error("shares list is empty");
  }

  const total = shares.reduce((sum, value) => sum + value, 0);
  if (total !== BPS_TOTAL) {
    throw new Error(`shares sum must be ${BPS_TOTAL}, got ${total}`);
  }

  for (const value of shares) {
    if (!Number.isInteger(value) || value <= 0 || value > BPS_TOTAL) {
      throw new Error(`invalid share value: ${value}`);
    }
  }
}

function dayIdFromTimestamp(seconds: number) {
  return Math.floor(seconds / 86400);
}

function parseBool(value: string, defaultValue: boolean) {
  if (!value) return defaultValue;
  return value.toLowerCase() === "true";
}

async function main() {
  const coreAddress = readEnv("INCUBATOR_CORE_PROXY", "VITE_CORE_CONTRACT_ADDRESS");
  if (!ethers.isAddress(coreAddress)) {
    throw new Error("Missing or invalid INCUBATOR_CORE_PROXY (or VITE_CORE_CONTRACT_ADDRESS)");
  }

  const [signer] = await ethers.getSigners();
  console.log("[settle-core] signer:", signer.address);
  console.log("[settle-core] core:", coreAddress);

  const core = await ethers.getContractAt(coreAbi, coreAddress, signer);
  const paused: boolean = await core.paused();
  if (paused) {
    console.log("[settle-core] core contract is paused, skip");
    return;
  }

  const enableNode = parseBool(readEnv("ENABLE_NODE_SETTLEMENT"), true);
  const enableSuperNode = parseBool(readEnv("ENABLE_SUPER_NODE_SETTLEMENT"), true);
  const enableLeaderboard = parseBool(readEnv("ENABLE_LEADERBOARD_SETTLEMENT"), true);

  if (enableNode) {
    await settleNodePool(core);
  }
  if (enableSuperNode) {
    await settleSuperNodePool(core);
  }
  if (enableLeaderboard) {
    await settleLeaderboardPool(core);
  }
}

async function settleNodePool(core: any) {
  const balance: bigint = await core.poolAccumulated(POOL_NODE);
  console.log("[settle-core] node pool balance:", balance.toString());
  if (balance <= 0n) {
    console.log("[settle-core] node pool empty, skip");
    return;
  }

  const recipients = parseAddressList(readEnv("NODE_REWARD_RECIPIENTS"));
  const shares = parseShareList(readEnv("NODE_REWARD_SHARES"));
  validateRecipientsAndShares("node", recipients, shares);

  const tx = await core.settleNodeRewards(recipients, shares);
  console.log("[settle-core] node settle tx:", tx.hash);
  const receipt = await tx.wait();
  console.log("[settle-core] node settled block:", receipt?.blockNumber ?? "unknown");
}

async function settleSuperNodePool(core: any) {
  const balance: bigint = await core.poolAccumulated(POOL_SUPER_NODE);
  console.log("[settle-core] super-node pool balance:", balance.toString());
  if (balance <= 0n) {
    console.log("[settle-core] super-node pool empty, skip");
    return;
  }

  const recipients = parseAddressList(readEnv("SUPER_NODE_REWARD_RECIPIENTS"));
  const shares = parseShareList(readEnv("SUPER_NODE_REWARD_SHARES"));
  validateRecipientsAndShares("super-node", recipients, shares);

  const tx = await core.settleSuperNodeRewards(recipients, shares);
  console.log("[settle-core] super-node settle tx:", tx.hash);
  const receipt = await tx.wait();
  console.log("[settle-core] super-node settled block:", receipt?.blockNumber ?? "unknown");
}

async function settleLeaderboardPool(core: any) {
  const balance: bigint = await core.poolAccumulated(POOL_LEADERBOARD);
  console.log("[settle-core] leaderboard pool balance:", balance.toString());
  if (balance <= 0n) {
    console.log("[settle-core] leaderboard pool empty, skip");
    return;
  }

  const dayIdRaw = readEnv("LEADERBOARD_DAY_ID");
  const now = Math.floor(Date.now() / 1000);
  const defaultDayId = Math.max(dayIdFromTimestamp(now) - 1, 0);
  const dayId = dayIdRaw ? Number(dayIdRaw) : defaultDayId;
  if (!Number.isInteger(dayId) || dayId < 0) {
    throw new Error(`invalid LEADERBOARD_DAY_ID: ${dayIdRaw}`);
  }

  const tx = await core.settleLeaderboard(dayId);
  console.log("[settle-core] leaderboard settle tx:", tx.hash, "dayId:", dayId);
  const receipt = await tx.wait();
  console.log("[settle-core] leaderboard settled block:", receipt?.blockNumber ?? "unknown");
}

function validateRecipientsAndShares(tag: string, recipients: string[], shares: number[]) {
  if (recipients.length === 0) {
    throw new Error(`${tag} recipients are required when pool has balance`);
  }
  if (recipients.length !== shares.length) {
    throw new Error(`${tag} recipients length mismatch with shares`);
  }

  for (const recipient of recipients) {
    if (!ethers.isAddress(recipient)) {
      throw new Error(`${tag} has invalid recipient address: ${recipient}`);
    }
  }

  validateShares(shares);
}

main().catch((error) => {
  console.error("[settle-core] failed:", error);
  process.exitCode = 1;
});
