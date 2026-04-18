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
  "function getUserRole(address user) view returns (uint8)",
  "function personalPower(address user) view returns (uint256)",
  "function referralOf(address user) view returns (address)",
  "function settleDailyRewardsIfDue(address[] participants, uint256 lightPriceInUsdt) external returns (bool)",
  "function settleDailyRewardsManual(address[] participants, uint256 lightPriceInUsdt) external",
  "function settlePoolRewards(uint8 poolType, address[] recipients, uint16[] shares) external",
  "function settleNodePoolOnChain(address[] candidates) external",
  "function settleSuperNodePoolOnChain(address[] candidates) external",
  "function teamPower(address user) view returns (uint256)",
  "function settleLeaderboard(uint256 dayId) external",
  "function paused() view returns (bool)",
  "function cycleDuration() view returns (uint256)",
  "event MachinePurchased(address indexed user, uint256 indexed orderId, uint256 quantity, uint256 amountUSDT, address indexed referrer)",
  "event NodePurchased(address indexed user, uint256 amountUSDT, uint256 indexed identityId)",
  "event SuperNodePurchased(address indexed user, uint256 amountUSDT, uint256 indexed identityId)",
  "event IdentityTransferred(uint256 indexed identityId, address indexed from, address indexed to, uint8 role)",
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
const BPS_TOTAL = 10_000;
const ROLE_NODE = 1;
const ROLE_SUPER_NODE = 2;

type SettlementRole = typeof ROLE_NODE | typeof ROLE_SUPER_NODE;
type WeightMode = "volume" | "power";

type WeightedSettlementPlan = {
  recipients: string[];
  shares: number[];
  weights: bigint[];
};

type SettlementContext = {
  candidates: string[];
  children: Map<string, string[]>;
  subtreeVolumes: Map<string, bigint>;
  roles: Map<string, number>;
};

let settlementContextPromise: Promise<SettlementContext> | null = null;
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

function resolveWeightMode(): WeightMode {
  const raw = (readEnv("SETTLEMENT_WEIGHT_MODE") || "volume").toLowerCase();
  if (raw === "power") return "power";
  if (raw === "volume") return "volume";
  throw new Error(`invalid SETTLEMENT_WEIGHT_MODE: ${raw}`);
}

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

function normalizeAddress(address: string) {
  return address.toLowerCase();
}

function addVolume(target: Map<string, bigint>, account: string, amount: bigint) {
  const key = normalizeAddress(account);
  target.set(key, (target.get(key) ?? 0n) + amount);
}

function pushChild(children: Map<string, string[]>, parent: string, child: string) {
  const key = normalizeAddress(parent);
  const existing = children.get(key) ?? [];
  if (!existing.includes(child)) {
    existing.push(child);
    children.set(key, existing);
  }
}

function computeSubtreeVolume(
  user: string,
  children: Map<string, string[]>,
  selfVolumes: Map<string, bigint>,
  memo: Map<string, bigint>
): bigint {
  const key = normalizeAddress(user);
  const cached = memo.get(key);
  if (cached !== undefined) {
    return cached;
  }

  let total = selfVolumes.get(key) ?? 0n;
  const directChildren = children.get(key) ?? [];
  for (const child of directChildren) {
    total += computeSubtreeVolume(child, children, selfVolumes, memo);
  }

  memo.set(key, total);
  return total;
}

function computeSmallAreaVolume(user: string, context: SettlementContext): bigint {
  const directChildren = context.children.get(normalizeAddress(user)) ?? [];
  if (directChildren.length <= 1) {
    return 0n;
  }

  let total = 0n;
  let largest = 0n;
  for (const child of directChildren) {
    const childVolume = context.subtreeVolumes.get(normalizeAddress(child)) ?? 0n;
    total += childVolume;
    if (childVolume > largest) {
      largest = childVolume;
    }
  }

  return total - largest;
}

function weightsToShares(entries: Array<{ recipient: string; weight: bigint }>): WeightedSettlementPlan {
  const ranked = entries
    .filter((entry) => entry.weight > 0n)
    .sort((left, right) => {
      if (left.weight === right.weight) {
        return left.recipient.localeCompare(right.recipient);
      }
      return left.weight > right.weight ? -1 : 1;
    });

  if (ranked.length === 0) {
    return { recipients: [], shares: [], weights: [] };
  }

  const totalWeight = ranked.reduce((sum, entry) => sum + entry.weight, 0n);
  let distributed = 0;

  const recipients: string[] = [];
  const shares: number[] = [];
  const weights: bigint[] = [];

  for (let i = 0; i < ranked.length; i++) {
    const entry = ranked[i];
    let share: number;
    if (i === ranked.length - 1) {
      share = BPS_TOTAL - distributed;
    } else {
      share = Number((entry.weight * BigInt(BPS_TOTAL)) / totalWeight);
    }

    if (share <= 0) {
      continue;
    }

    recipients.push(entry.recipient);
    shares.push(share);
    weights.push(entry.weight);
    distributed += share;
  }

  if (shares.length === 0) {
    return { recipients: [], shares: [], weights: [] };
  }

  const totalShares = shares.reduce((sum, value) => sum + value, 0);
  if (totalShares !== BPS_TOTAL) {
    shares[shares.length - 1] += BPS_TOTAL - totalShares;
  }

  return { recipients, shares, weights };
}

async function loadSettlementContext(core: any): Promise<SettlementContext> {
  if (settlementContextPromise) {
    return settlementContextPromise;
  }

  settlementContextPromise = (async () => {
    const weightMode = resolveWeightMode();
    const participants = await loadParticipants(core);
    const purchaseVolumes = await loadPurchaseVolumes(core);
    const candidatesSet = new Set<string>(participants.map((item) => normalizeAddress(item)));
    for (const account of purchaseVolumes.keys()) {
      candidatesSet.add(account);
    }

    const candidates = Array.from(candidatesSet);
    const children = new Map<string, string[]>();
    const roles = new Map<string, number>();

    for (const account of candidates) {
      const [roleRaw, referrer] = await Promise.all([
        core.getUserRole(account),
        core.referralOf(account),
      ]);

      const role = Number(roleRaw);
      roles.set(account, role);

      if (ethers.isAddress(referrer) && referrer !== ethers.ZeroAddress) {
        pushChild(children, referrer, account);
      }
    }

    const selfWeights =
      weightMode === "power"
        ? await loadPersonalPowerWeights(core, candidates)
        : purchaseVolumes;

    const subtreeVolumes = new Map<string, bigint>();
    for (const account of candidates) {
      computeSubtreeVolume(account, children, selfWeights, subtreeVolumes);
    }

    console.log(`[settle-core] settlement weight mode: ${weightMode}`);

    return {
      candidates,
      children,
      subtreeVolumes,
      roles,
    };
  })();

  return settlementContextPromise;
}

async function loadPersonalPowerWeights(core: any, candidates: string[]): Promise<Map<string, bigint>> {
  const powerWeights = new Map<string, bigint>();

  for (const account of candidates) {
    const powerRaw = await core.personalPower(account);
    powerWeights.set(normalizeAddress(account), BigInt(powerRaw));
  }

  return powerWeights;
}

async function loadParticipants(core: any): Promise<string[]> {
  const participantCount: bigint = await core.getParticipantCount();
  const total = Number(participantCount);
  const participants: string[] = [];

  for (let i = 0; i < total; i++) {
    const participant: string = await core.getParticipantAt(i);
    if (ethers.isAddress(participant)) {
      participants.push(normalizeAddress(participant));
    }
  }

  return participants;
}

async function loadPurchaseVolumes(core: any): Promise<Map<string, bigint>> {
  const startBlock = Number(readEnv("CORE_SETTLEMENT_FROM_BLOCK") || "0");
  const chunkSize = Number(readEnv("CORE_EVENT_CHUNK_SIZE") || "5000");
  if (!Number.isInteger(startBlock) || startBlock < 0) {
    throw new Error(`invalid CORE_SETTLEMENT_FROM_BLOCK: ${startBlock}`);
  }
  if (!Number.isInteger(chunkSize) || chunkSize <= 0) {
    throw new Error(`invalid CORE_EVENT_CHUNK_SIZE: ${chunkSize}`);
  }

  const provider = ethers.provider;
  const latestBlock = await provider.getBlockNumber();
  const purchaseVolumes = new Map<string, bigint>();

  const machineFilter = core.filters.MachinePurchased();
  const transferFilter = core.filters.IdentityTransferred();

  for (let fromBlock = startBlock; fromBlock <= latestBlock; fromBlock += chunkSize) {
    const toBlock = Math.min(fromBlock + chunkSize - 1, latestBlock);
    const [machineLogs, transferLogs] = await Promise.all([
      core.queryFilter(machineFilter, fromBlock, toBlock),
      core.queryFilter(transferFilter, fromBlock, toBlock),
    ]);

    for (const log of machineLogs) {
      const user = log.args?.user;
      const amountUSDT = log.args?.amountUSDT;
      if (user && amountUSDT !== undefined) {
        addVolume(purchaseVolumes, user, BigInt(amountUSDT));
      }
    }

    for (const log of transferLogs) {
      const to = log.args?.to;
      if (to && ethers.isAddress(to)) {
        const key = normalizeAddress(to);
        if (!purchaseVolumes.has(key)) {
          purchaseVolumes.set(key, 0n);
        }
      }
    }
  }

  return purchaseVolumes;
}

async function buildWeightedSettlementPlan(core: any, role: SettlementRole): Promise<WeightedSettlementPlan> {
  const context = await loadSettlementContext(core);
  const entries: Array<{ recipient: string; weight: bigint }> = [];

  for (const account of context.candidates) {
    if (context.roles.get(account) !== role) {
      continue;
    }

    const weight = computeSmallAreaVolume(account, context);
    if (weight <= 0n) {
      continue;
    }

    entries.push({ recipient: account, weight });
  }

  return weightsToShares(entries);
}

function logWeightedPlan(tag: string, plan: WeightedSettlementPlan) {
  if (plan.recipients.length === 0) {
    console.log(`[settle-core] ${tag} auto plan empty`);
    return;
  }

  const preview = Math.min(plan.recipients.length, 10);
  console.log(`[settle-core] ${tag} auto recipients:`, plan.recipients.length);
  for (let i = 0; i < preview; i++) {
    console.log(
      `[settle-core] ${tag} #${i + 1}:`,
      plan.recipients[i],
      "share=",
      plan.shares[i],
      "weight=",
      plan.weights[i].toString()
    );
  }
}

function dayIdFromTimestamp(seconds: number) {
  return Math.floor(seconds / _cycleDurationSeconds);
}

let _cycleDurationSeconds = 86400; // default; overridden by on-chain value

function parseBool(value: string, defaultValue: boolean) {
  if (!value) return defaultValue;
  return value.toLowerCase() === "true";
}

function auditStep(step: string, data: Record<string, unknown> = {}) {
  settlementAudit.steps.push({
    at: new Date().toISOString(),
    step,
    ...data,
  });
}

function stringifyAuditData(data: unknown) {
  return JSON.stringify(
    data,
    (_key, value) => {
      if (typeof value === "bigint") {
        return value.toString();
      }
      return value;
    },
    2
  );
}

async function flushAuditFile() {
  if (!auditWriteEnabled || auditFlushed) {
    return;
  }

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
  const weightMode = resolveWeightMode();
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

  // Read on-chain cycle duration (0 means default 86400)
  try {
    const onChainCycle: bigint = await core.cycleDuration();
    if (onChainCycle > 0n) {
      _cycleDurationSeconds = Number(onChainCycle);
    }
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
    weightMode,
    dryRunMode,
  });

  if (dryRunMode) {
    console.log("[settle-core] dry-run enabled, no transaction will be sent");
  }

  if (enableDailyRewards) {
    await settleDailyRewards(core);
  }

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
    auditStep("node_pool", { balance: balance.toString(), action: "skip_empty" });
    return;
  }

  if (onChainMode()) {
    const candidates = await buildOnChainCandidates(core, ROLE_NODE, true);
    auditStep("node_pool", {
      balance: balance.toString(),
      action: dryRunMode ? "onchain_dry_run" : "onchain_settle",
      candidatesCount: candidates.length,
      mode: "onchain",
    });
    if (candidates.length === 0) {
      console.log("[settle-core] node onchain candidates empty, skip");
      return;
    }
    if (dryRunMode) return;
    const tx = await core.settleNodePoolOnChain(candidates);
    console.log("[settle-core] node on-chain settle tx:", tx.hash);
    const receipt = await tx.wait();
    console.log("[settle-core] node on-chain settled block:", receipt?.blockNumber ?? "unknown");
    return;
  }

  const recipients = parseAddressList(readEnv("NODE_REWARD_RECIPIENTS"));
  const shares = parseShareList(readEnv("NODE_REWARD_SHARES"));
  if (recipients.length > 0 || shares.length > 0) {
    validateRecipientsAndShares("node", recipients, shares);
    auditStep("node_pool", {
      balance: balance.toString(),
      action: dryRunMode ? "manual_dry_run" : "manual_settle",
      recipients,
      shares,
    });

    if (dryRunMode) {
      console.log("[settle-core] node manual dry-run recipients:", recipients.length);
      return;
    }

    const tx = await core.settlePoolRewards(POOL_NODE, recipients, shares);
    console.log("[settle-core] node settle tx:", tx.hash);
    const receipt = await tx.wait();
    console.log("[settle-core] node settled block:", receipt?.blockNumber ?? "unknown");
    return;
  }

  const plan = await buildWeightedSettlementPlan(core, ROLE_NODE);
  logWeightedPlan("node", plan);
  if (plan.recipients.length === 0) {
    console.log("[settle-core] node auto plan empty, skip");
    auditStep("node_pool", { balance: balance.toString(), action: "skip_no_plan" });
    return;
  }

  auditStep("node_pool", {
    balance: balance.toString(),
    action: dryRunMode ? "auto_dry_run" : "auto_settle",
    recipientsCount: plan.recipients.length,
    preview: plan.recipients.slice(0, 10).map((recipient, index) => ({
      recipient,
      share: plan.shares[index],
      weight: plan.weights[index].toString(),
    })),
  });

  if (dryRunMode) {
    return;
  }

  const tx = await core.settlePoolRewards(POOL_NODE, plan.recipients, plan.shares);
  console.log("[settle-core] node settle tx:", tx.hash);
  const receipt = await tx.wait();
  console.log("[settle-core] node settled block:", receipt?.blockNumber ?? "unknown");
}

async function settleSuperNodePool(core: any) {
  const balance: bigint = await core.poolAccumulated(POOL_SUPER_NODE);
  console.log("[settle-core] super-node pool balance:", balance.toString());
  if (balance <= 0n) {
    console.log("[settle-core] super-node pool empty, skip");
    auditStep("super_node_pool", { balance: balance.toString(), action: "skip_empty" });
    return;
  }

  if (onChainMode()) {
    const candidates = await buildOnChainCandidates(core, ROLE_SUPER_NODE, false);
    auditStep("super_node_pool", {
      balance: balance.toString(),
      action: dryRunMode ? "onchain_dry_run" : "onchain_settle",
      candidatesCount: candidates.length,
      mode: "onchain",
    });
    if (candidates.length === 0) {
      console.log("[settle-core] super-node onchain candidates empty, skip");
      return;
    }
    if (dryRunMode) return;
    const tx = await core.settleSuperNodePoolOnChain(candidates);
    console.log("[settle-core] super-node on-chain settle tx:", tx.hash);
    const receipt = await tx.wait();
    console.log("[settle-core] super-node on-chain settled block:", receipt?.blockNumber ?? "unknown");
    return;
  }

  const recipients = parseAddressList(readEnv("SUPER_NODE_REWARD_RECIPIENTS"));
  const shares = parseShareList(readEnv("SUPER_NODE_REWARD_SHARES"));
  if (recipients.length > 0 || shares.length > 0) {
    validateRecipientsAndShares("super-node", recipients, shares);
    auditStep("super_node_pool", {
      balance: balance.toString(),
      action: dryRunMode ? "manual_dry_run" : "manual_settle",
      recipients,
      shares,
    });

    if (dryRunMode) {
      console.log("[settle-core] super-node manual dry-run recipients:", recipients.length);
      return;
    }

    const tx = await core.settlePoolRewards(POOL_SUPER_NODE, recipients, shares);
    console.log("[settle-core] super-node settle tx:", tx.hash);
    const receipt = await tx.wait();
    console.log("[settle-core] super-node settled block:", receipt?.blockNumber ?? "unknown");
    return;
  }

  const plan = await buildWeightedSettlementPlan(core, ROLE_SUPER_NODE);
  logWeightedPlan("super-node", plan);
  if (plan.recipients.length === 0) {
    console.log("[settle-core] super-node auto plan empty, skip");
    auditStep("super_node_pool", { balance: balance.toString(), action: "skip_no_plan" });
    return;
  }

  auditStep("super_node_pool", {
    balance: balance.toString(),
    action: dryRunMode ? "auto_dry_run" : "auto_settle",
    recipientsCount: plan.recipients.length,
    preview: plan.recipients.slice(0, 10).map((recipient, index) => ({
      recipient,
      share: plan.shares[index],
      weight: plan.weights[index].toString(),
    })),
  });

  if (dryRunMode) {
    return;
  }

  const tx = await core.settlePoolRewards(POOL_SUPER_NODE, plan.recipients, plan.shares);
  console.log("[settle-core] super-node settle tx:", tx.hash);
  const receipt = await tx.wait();
  console.log("[settle-core] super-node settled block:", receipt?.blockNumber ?? "unknown");
}

async function settleLeaderboardPool(core: any) {
  const balance: bigint = await core.poolAccumulated(POOL_LEADERBOARD);
  console.log("[settle-core] leaderboard pool balance:", balance.toString());
  if (balance <= 0n) {
    console.log("[settle-core] leaderboard pool empty, skip");
    auditStep("leaderboard_pool", { balance: balance.toString(), action: "skip_empty" });
    return;
  }
  const dayIdRaw = readEnv("LEADERBOARD_DAY_ID");
  const now = Math.floor(Date.now() / 1000);
  const defaultDayId = Math.max(dayIdFromTimestamp(now) - 1, 0);
  const dayId = dayIdRaw ? Number(dayIdRaw) : defaultDayId;
  if (!Number.isInteger(dayId) || dayId < 0) {
    throw new Error(`invalid LEADERBOARD_DAY_ID: ${dayIdRaw}`);
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

function onChainMode(): boolean {
  return parseBool(readEnv("SETTLEMENT_ONCHAIN_MODE"), false);
}

async function buildOnChainCandidates(
  core: any,
  primaryRole: SettlementRole,
  allowSuperNode: boolean
): Promise<string[]> {
  const envList = parseAddressList(readEnv(primaryRole === ROLE_NODE ? "NODE_ONCHAIN_CANDIDATES" : "SUPER_NODE_ONCHAIN_CANDIDATES"));
  if (envList.length > 0) {
    return envList;
  }
  const ctx = await loadSettlementContext(core);
  const out: string[] = [];
  for (const addr of ctx.candidates) {
    const role = ctx.roles.get(normalizeAddress(addr)) ?? 0;
    if (role === primaryRole || (allowSuperNode && role === ROLE_SUPER_NODE)) {
      const tp = (await core.teamPower(addr).catch(() => 0n)) as bigint;
      if (tp > 0n) out.push(addr);
    }
  }
  return out;
}

async function computeLightPriceInUsdt(): Promise<bigint> {
  const swapAddress = readEnv("SWAP_POOL_MANAGER_PROXY", "VITE_SWAP_POOL_ADDRESS");
  const pancakePairAddress = readEnv("PANCAKE_V2_USDT_ICO_PAIR", "VITE_PANCAKE_V2_FACTORY_ADDRESS");
  const usdtAddress = readEnv("USDT_TOKEN_ADDRESS", "VITE_USDT_TOKEN_ADDRESS").toLowerCase();

  if (!ethers.isAddress(swapAddress)) {
    throw new Error("Missing SWAP_POOL_MANAGER_PROXY for LIGHT price calculation");
  }
  if (!ethers.isAddress(pancakePairAddress)) {
    throw new Error("Missing PANCAKE_V2_USDT_ICO_PAIR for LIGHT price calculation");
  }

  const [signer] = await ethers.getSigners();
  const swap = await ethers.getContractAt(swapPoolAbi, swapAddress, signer);
  const pancakePair = await ethers.getContractAt(pancakePairAbi, pancakePairAddress, signer);

  // LIGHT/ICO pool (pairId=1): token0=LIGHT, token1=ICO
  const [, , lightReserve, icoReserve, , , poolExists] = await swap.getPool(1);
  if (!poolExists) {
    throw new Error("LIGHT/ICO pool does not exist");
  }
  if (lightReserve <= 0n || icoReserve <= 0n) {
    throw new Error("LIGHT/ICO pool has no liquidity");
  }

  // PancakeV2 USDT/ICO pair: determine token order
  const pairToken0: string = await pancakePair.token0();
  const [reserve0, reserve1] = await pancakePair.getReserves();
  const usdtIsToken0 = pairToken0.toLowerCase() === usdtAddress;
  const pancakeUsdtReserve = usdtIsToken0 ? BigInt(reserve0) : BigInt(reserve1);
  const pancakeIcoReserve = usdtIsToken0 ? BigInt(reserve1) : BigInt(reserve0);

  if (pancakeUsdtReserve <= 0n || pancakeIcoReserve <= 0n) {
    throw new Error("PancakeV2 USDT/ICO pair has no liquidity");
  }

  // 1 LIGHT = (icoReserve / lightReserve) ICO
  // 1 ICO = (pancakeUsdtReserve / pancakeIcoReserve) USDT
  // 1 LIGHT = (icoReserve * pancakeUsdtReserve) / (lightReserve * pancakeIcoReserve) USDT
  // Scale to 18 decimals:
  const price = (BigInt(icoReserve) * BigInt(pancakeUsdtReserve) * 10n ** 18n) / (BigInt(lightReserve) * BigInt(pancakeIcoReserve));

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
    if (ethers.isAddress(participant)) {
      participants.push(participant);
    }
  }

  return participants;
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
