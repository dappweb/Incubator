import * as dotenv from "dotenv";
import { ethers } from "hardhat";
import { promises as fs } from "node:fs";
import * as path from "node:path";

dotenv.config({ path: ".env" });

const coreAbi = [
  "function poolAccumulated(uint8 poolType) view returns (uint256)",
  "function rewardPoolBalance() view returns (uint256)",
  "function getParticipantCount() view returns (uint256)",
  "function getParticipantAt(uint256 index) view returns (address)",
  "function getNodeList() view returns (address[])",
  "function getSuperNodeList() view returns (address[])",
  "function lastNodePoolSettleDay() view returns (uint256)",
  "function lastSuperNodePoolSettleDay() view returns (uint256)",
  "function leaderboardSettledDay(uint256) view returns (bool)",
  "function minPoolSettleAmount() view returns (uint256)",
  "function publicSettleEnabled() view returns (bool)",
  "function settleDailyRewardsIfDue(address[] participants, uint256 lightPriceInUsdt) external returns (bool)",
  "function settleDailyRewardsManual(address[] participants, uint256 lightPriceInUsdt) external",
  "function settleNodePoolOnChain() external returns (bool)",
  "function settleSuperNodePoolOnChain() external returns (bool)",
  "function settleLeaderboard(uint256 dayId) external",
  "function paused() view returns (bool)",
  "function cycleDuration() view returns (uint256)",
];

const swapPoolAbi = [
  "function getPool(uint8 pairId) view returns (address token0, address token1, uint256 reserve0, uint256 reserve1, uint16 feeBps, uint16 maxPriceImpactBps, bool exists)",
];

const pancakePairAbi = [
  "function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)",
  "function token0() view returns (address)",
];

const POOL_SUPER_NODE = 2;
const POOL_NODE = 3;
const POOL_LEADERBOARD = 5;

let _cycleDurationSeconds = 86400;
let dryRunMode = false;
let auditWriteEnabled = true;
let auditFlushed = false;

type AuditStep = Record<string, unknown>;

const settlementAudit: {
  startedAt: string;
  finishedAt?: string;
  status: "running" | "success" | "failed";
  coreAddress?: string;
  chainId?: string;
  signer?: string;
  dryRun?: boolean;
  steps: AuditStep[];
  error?: string;
} = {
  startedAt: new Date().toISOString(),
  status: "running",
  steps: [],
};

function readEnv(...keys: string[]) {
  for (const key of keys) {
    const value = process.env[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function parseBool(value: string, defaultValue: boolean) {
  if (!value) return defaultValue;
  return value.toLowerCase() === "true";
}

function parseAddressList(raw: string): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((x) => x.trim())
    .filter((x) => x.length > 0);
}

function dayIdFromTimestamp(seconds: number) {
  return Math.floor(seconds / _cycleDurationSeconds);
}

function auditStep(step: string, data: Record<string, unknown> = {}) {
  settlementAudit.steps.push({ at: new Date().toISOString(), step, ...data });
}

function stringifyAuditData(data: unknown) {
  return JSON.stringify(
    data,
    (_key, value) => (typeof value === "bigint" ? value.toString() : value),
    2,
  );
}

async function flushAuditFile() {
  if (!auditWriteEnabled || auditFlushed) return;
  const outputDir = readEnv("SETTLEMENT_AUDIT_DIR") || "artifacts/settlement-runs";
  const now = new Date();
  const timestamp = now
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z")
    .replace("T", "-");
  const chainTag = settlementAudit.chainId ?? "unknown";
  const filename = `core-settlement-${chainTag}-${timestamp}.json`;
  await fs.mkdir(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, filename);
  settlementAudit.finishedAt = new Date().toISOString();
  await fs.writeFile(outputPath, stringifyAuditData(settlementAudit), "utf8");
  auditFlushed = true;
  console.log("[settle-core] audit file:", outputPath);
}

async function main() {
  const coreAddress = readEnv("INCUBATOR_CORE_PROXY", "VITE_CORE_CONTRACT_ADDRESS");
  if (!ethers.isAddress(coreAddress)) {
    throw new Error("Missing or invalid INCUBATOR_CORE_PROXY (or VITE_CORE_CONTRACT_ADDRESS)");
  }

  const [signer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();
  const contractCode = await ethers.provider.getCode(coreAddress);
  console.log("[settle-core] signer:", signer.address);
  console.log("[settle-core] chainId:", network.chainId.toString());
  console.log("[settle-core] core:", coreAddress);

  settlementAudit.coreAddress = coreAddress;
  settlementAudit.chainId = network.chainId.toString();
  settlementAudit.signer = signer.address;

  if (contractCode === "0x") {
    throw new Error(`No contract code found at ${coreAddress} on chain ${network.chainId.toString()}`);
  }

  const core = await ethers.getContractAt(coreAbi, coreAddress, signer);
  const paused: boolean = await core.paused();
  if (paused) {
    console.log("[settle-core] core contract is paused, skip");
    return;
  }

  try {
    const onChainCycle: bigint = await core.cycleDuration();
    if (onChainCycle > 0n) _cycleDurationSeconds = Number(onChainCycle);
    console.log("[settle-core] cycleDuration:", _cycleDurationSeconds, "seconds");
  } catch {
    console.log("[settle-core] cycleDuration() not available, using default 86400s");
  }

  const enableNode = parseBool(readEnv("ENABLE_NODE_SETTLEMENT"), true);
  const enableSuperNode = parseBool(readEnv("ENABLE_SUPER_NODE_SETTLEMENT"), true);
  const enableLeaderboard = parseBool(readEnv("ENABLE_LEADERBOARD_SETTLEMENT"), true);
  const enableDailyRewards = parseBool(readEnv("ENABLE_DAILY_REWARD_SETTLEMENT"), true);
  dryRunMode = parseBool(readEnv("SETTLEMENT_DRY_RUN"), false);
  auditWriteEnabled = parseBool(readEnv("SETTLEMENT_WRITE_AUDIT"), true);
  settlementAudit.dryRun = dryRunMode;

  auditStep("start", {
    enableNode,
    enableSuperNode,
    enableLeaderboard,
    enableDailyRewards,
    dryRunMode,
  });
  if (dryRunMode) console.log("[settle-core] dry-run enabled, no transaction will be sent");

  if (enableDailyRewards) await settleDailyRewards(core);
  if (enableNode) await settleNodePool(core);
  if (enableSuperNode) await settleSuperNodePool(core);
  if (enableLeaderboard) await settleLeaderboardPool(core);
}

async function settleNodePool(core: any) {
  const balance: bigint = await core.poolAccumulated(POOL_NODE);
  const minAmount: bigint = await core.minPoolSettleAmount().catch(() => 0n);
  const lastDay: bigint = await core.lastNodePoolSettleDay().catch(() => 0n);
  const today = BigInt(dayIdFromTimestamp(Math.floor(Date.now() / 1000)));
  console.log(
    `[settle-core] node pool balance=${balance.toString()} min=${minAmount.toString()} lastDay=${lastDay.toString()} today=${today.toString()}`,
  );

  if (balance === 0n || balance < minAmount) {
    console.log("[settle-core] node pool below min or empty, skip");
    auditStep("node_pool", { balance: balance.toString(), action: "skip_below_min" });
    return;
  }
  if (today <= lastDay) {
    console.log("[settle-core] node pool already settled today, skip");
    auditStep("node_pool", {
      balance: balance.toString(),
      action: "skip_already_settled",
      today: today.toString(),
      lastDay: lastDay.toString(),
    });
    return;
  }
  auditStep("node_pool", {
    balance: balance.toString(),
    action: dryRunMode ? "dry_run" : "settle",
    today: today.toString(),
  });
  if (dryRunMode) return;
  const tx = await core.settleNodePoolOnChain();
  console.log("[settle-core] node settle tx:", tx.hash);
  const receipt = await tx.wait();
  console.log("[settle-core] node settled block:", receipt?.blockNumber ?? "unknown");
}

async function settleSuperNodePool(core: any) {
  const balance: bigint = await core.poolAccumulated(POOL_SUPER_NODE);
  const minAmount: bigint = await core.minPoolSettleAmount().catch(() => 0n);
  const lastDay: bigint = await core.lastSuperNodePoolSettleDay().catch(() => 0n);
  const today = BigInt(dayIdFromTimestamp(Math.floor(Date.now() / 1000)));
  console.log(
    `[settle-core] super-node pool balance=${balance.toString()} min=${minAmount.toString()} lastDay=${lastDay.toString()} today=${today.toString()}`,
  );

  if (balance === 0n || balance < minAmount) {
    console.log("[settle-core] super-node pool below min or empty, skip");
    auditStep("super_node_pool", { balance: balance.toString(), action: "skip_below_min" });
    return;
  }
  if (today <= lastDay) {
    console.log("[settle-core] super-node pool already settled today, skip");
    auditStep("super_node_pool", {
      balance: balance.toString(),
      action: "skip_already_settled",
      today: today.toString(),
      lastDay: lastDay.toString(),
    });
    return;
  }
  auditStep("super_node_pool", {
    balance: balance.toString(),
    action: dryRunMode ? "dry_run" : "settle",
    today: today.toString(),
  });
  if (dryRunMode) return;
  const tx = await core.settleSuperNodePoolOnChain();
  console.log("[settle-core] super-node settle tx:", tx.hash);
  const receipt = await tx.wait();
  console.log("[settle-core] super-node settled block:", receipt?.blockNumber ?? "unknown");
}

async function settleLeaderboardPool(core: any) {
  const balance: bigint = await core.poolAccumulated(POOL_LEADERBOARD);
  const minAmount: bigint = await core.minPoolSettleAmount().catch(() => 0n);
  console.log(`[settle-core] leaderboard pool balance=${balance.toString()} min=${minAmount.toString()}`);
  if (balance === 0n || balance < minAmount) {
    console.log("[settle-core] leaderboard pool below min or empty, skip");
    auditStep("leaderboard_pool", { balance: balance.toString(), action: "skip_below_min" });
    return;
  }

  const dayIdRaw = readEnv("LEADERBOARD_DAY_ID");
  const now = Math.floor(Date.now() / 1000);
  const defaultDayId = Math.max(dayIdFromTimestamp(now) - 1, 0);
  const dayId = dayIdRaw ? Number(dayIdRaw) : defaultDayId;
  if (!Number.isInteger(dayId) || dayId < 0) {
    throw new Error(`invalid LEADERBOARD_DAY_ID: ${dayIdRaw}`);
  }

  const already: boolean = await core.leaderboardSettledDay(BigInt(dayId)).catch(() => false);
  if (already) {
    console.log("[settle-core] leaderboard already settled for dayId", dayId, "skip");
    auditStep("leaderboard_pool", { balance: balance.toString(), action: "skip_already_settled", dayId });
    return;
  }

  auditStep("leaderboard_pool", {
    balance: balance.toString(),
    dayId,
    action: dryRunMode ? "dry_run" : "settle",
  });
  if (dryRunMode) {
    console.log("[settle-core] leaderboard dry-run dayId:", dayId);
    return;
  }
  const tx = await core.settleLeaderboard(dayId);
  console.log("[settle-core] leaderboard settle tx:", tx.hash, "dayId:", dayId);
  const receipt = await tx.wait();
  console.log("[settle-core] leaderboard settled block:", receipt?.blockNumber ?? "unknown");
}

async function computeLightPriceInUsdt(): Promise<bigint> {
  const swapAddress = readEnv("SWAP_POOL_MANAGER_PROXY", "VITE_SWAP_POOL_ADDRESS");
  const pancakePairAddress = readEnv("PANCAKE_V2_USDT_ICO_PAIR", "VITE_PANCAKE_V2_FACTORY_ADDRESS");
  const usdtAddress = readEnv("USDT_TOKEN_ADDRESS", "VITE_USDT_TOKEN_ADDRESS").toLowerCase();

  if (!ethers.isAddress(swapAddress)) throw new Error("Missing SWAP_POOL_MANAGER_PROXY for LIGHT price calculation");
  if (!ethers.isAddress(pancakePairAddress)) throw new Error("Missing PANCAKE_V2_USDT_ICO_PAIR for LIGHT price calculation");

  const [signer] = await ethers.getSigners();
  const swap = await ethers.getContractAt(swapPoolAbi, swapAddress, signer);
  const pancakePair = await ethers.getContractAt(pancakePairAbi, pancakePairAddress, signer);

  const [, , lightReserve, icoReserve, , , poolExists] = await swap.getPool(1);
  if (!poolExists) throw new Error("LIGHT/ICO pool does not exist");
  if (lightReserve <= 0n || icoReserve <= 0n) throw new Error("LIGHT/ICO pool has no liquidity");

  const pairToken0: string = await pancakePair.token0();
  const [reserve0, reserve1] = await pancakePair.getReserves();
  const usdtIsToken0 = pairToken0.toLowerCase() === usdtAddress;
  const pancakeUsdtReserve = usdtIsToken0 ? BigInt(reserve0) : BigInt(reserve1);
  const pancakeIcoReserve = usdtIsToken0 ? BigInt(reserve1) : BigInt(reserve0);
  if (pancakeUsdtReserve <= 0n || pancakeIcoReserve <= 0n) throw new Error("PancakeV2 USDT/ICO pair has no liquidity");

  const price =
    (BigInt(icoReserve) * BigInt(pancakeUsdtReserve) * 10n ** 18n) /
    (BigInt(lightReserve) * BigInt(pancakeIcoReserve));
  console.log("[settle-core] computed LIGHT price in USDT:", ethers.formatUnits(price, 18), "USDT");
  return price;
}

async function settleDailyRewards(core: any) {
  const rewardPoolBalance: bigint = await core.rewardPoolBalance();
  console.log("[settle-core] daily reward pool balance:", rewardPoolBalance.toString());
  if (rewardPoolBalance <= 0n) {
    console.log("[settle-core] reward pool empty, skip");
    auditStep("daily_rewards", { rewardPoolBalance: rewardPoolBalance.toString(), action: "skip_empty" });
    return;
  }

  const manualMode = parseBool(readEnv("DAILY_REWARD_MANUAL"), false);
  const participants = await resolveDailyRewardParticipants(core);
  if (participants.length === 0) {
    console.log("[settle-core] no participants, skip daily reward settlement");
    auditStep("daily_rewards", { rewardPoolBalance: rewardPoolBalance.toString(), action: "skip_no_participants" });
    return;
  }

  const lightPriceInUsdt = await computeLightPriceInUsdt();
  if (lightPriceInUsdt <= 0n) {
    console.log("[settle-core] LIGHT price is zero, skip daily reward settlement");
    auditStep("daily_rewards", { rewardPoolBalance: rewardPoolBalance.toString(), action: "skip_zero_price" });
    return;
  }

  auditStep("daily_rewards", {
    rewardPoolBalance: rewardPoolBalance.toString(),
    participantsCount: participants.length,
    lightPriceInUsdt: lightPriceInUsdt.toString(),
    mode: manualMode ? "manual" : "if_due",
    action: dryRunMode ? "dry_run" : "settle",
  });
  if (dryRunMode) {
    console.log("[settle-core] daily reward dry-run participants:", participants.length);
    return;
  }

  if (manualMode) {
    const tx = await core.settleDailyRewardsManual(participants, lightPriceInUsdt);
    console.log("[settle-core] daily reward manual tx:", tx.hash, "participants:", participants.length);
    const receipt = await tx.wait();
    console.log("[settle-core] daily reward settled block:", receipt?.blockNumber ?? "unknown");
    return;
  }

  const tx = await core.settleDailyRewardsIfDue(participants, lightPriceInUsdt);
  console.log("[settle-core] daily reward if-due tx:", tx.hash, "participants:", participants.length);
  const receipt = await tx.wait();
  console.log("[settle-core] daily reward if-due confirmed block:", receipt?.blockNumber ?? "unknown");
}

async function resolveDailyRewardParticipants(core: any): Promise<string[]> {
  const rawParticipants = parseAddressList(readEnv("DAILY_REWARD_PARTICIPANTS"));
  if (rawParticipants.length > 0) {
    for (const participant of rawParticipants) {
      if (!ethers.isAddress(participant)) {
        throw new Error(`invalid DAILY_REWARD_PARTICIPANTS address: ${participant}`);
      }
    }
    return rawParticipants;
  }

  const maxParticipants = Number(readEnv("DAILY_REWARD_MAX_PARTICIPANTS") || "1000");
  if (!Number.isInteger(maxParticipants) || maxParticipants <= 0) {
    throw new Error("DAILY_REWARD_MAX_PARTICIPANTS must be a positive integer");
  }

  const participantCount: bigint = await core.getParticipantCount();
  const limit = Math.min(Number(participantCount), maxParticipants);
  const participants: string[] = [];
  for (let i = 0; i < limit; i++) {
    const participant: string = await core.getParticipantAt(i);
    if (ethers.isAddress(participant)) participants.push(participant);
  }
  return participants;
}

main()
  .then(async () => {
    settlementAudit.status = "success";
    await flushAuditFile();
  })
  .catch(async (error) => {
    settlementAudit.status = "failed";
    settlementAudit.error = error instanceof Error ? error.message : String(error);
    auditStep("failed", { error: settlementAudit.error });
    await flushAuditFile();
    console.error("[settle-core] failed:", error);
    process.exitCode = 1;
  });
