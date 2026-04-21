import { AbiCoder, BrowserProvider, getAddress, id as keccak256id, zeroPadValue } from "ethers";
import { CORE_CONTRACT_ADDRESS } from "../config";
import { getCoreContract } from "./coreContract";

// ────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────
const BLOCK_TIME = 3; // CNC ~3 s/block
const BLOCKS_PER_DAY = Math.ceil(86400 / BLOCK_TIME); // 28 800
// Default rank shares (initialised in contract, no public setter)
const RANK_SHARES = [4000, 2000, 500, 500, 500, 500, 500, 500, 500, 500] as const;

const TOPIC_LEADERBOARD_SETTLED = keccak256id(
  "LeaderboardSettled(uint256,address,uint8,uint256)",
);
const TOPIC_LEADERBOARD_LUCKY_SETTLED = keccak256id(
  "LeaderboardLuckySettled(uint256,address,uint8,uint256)",
);
const TOPIC_MACHINE_PURCHASED = keccak256id(
  "MachinePurchased(address,uint256,uint256,uint256,address)",
);
const TOPIC_LEADERBOARD_UPDATED = keccak256id(
  "LeaderboardUpdated(uint256,address,uint256)",
);

// ────────────────────────────────────────────────────────
// Public types
// ────────────────────────────────────────────────────────
export interface TopEntry {
  rank: number;
  address: string;
  totalVolume: bigint;
  rewardAmount: bigint | null; // null = not yet settled
  timestamp: number; // unix seconds, 0 if unknown
}

export interface FomoEntry {
  rank: number;
  address: string;
  purchaseAmount: bigint;
  rewardAmount: bigint | null;
  timestamp: number;
}

export interface LeaderboardDay {
  dayId: number;
  top10: TopEntry[];
  last10: FomoEntry[];
  totalPool: bigint; // poolAccumulated[5] at query time (only relevant for today)
}

// ────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────
function currentDayId(): number {
  return Math.floor(Date.now() / 1000 / 86400);
}

function padUint(n: number | bigint): string {
  return zeroPadValue("0x" + BigInt(n).toString(16), 32);
}

/** Approximate block range for a UTC dayId */
function blockRangeForDay(
  latestBlock: number,
  latestTs: number,
  dayId: number,
): { fromBlock: number; toBlock: number } {
  const dayStart = dayId * 86400;
  const dayEnd = dayStart + 86400;
  const blocksToStart = Math.ceil((latestTs - dayStart) / BLOCK_TIME);
  const blocksToEnd = Math.ceil((latestTs - dayEnd) / BLOCK_TIME);
  const BUFFER = 200;
  const fromBlock = Math.max(0, latestBlock - blocksToStart - BUFFER);
  const toBlock =
    blocksToEnd > 0
      ? Math.min(latestBlock, latestBlock - blocksToEnd + BUFFER)
      : latestBlock;
  return { fromBlock, toBlock: Math.max(fromBlock, toBlock) };
}

type EthersLog = Awaited<ReturnType<BrowserProvider["getLogs"]>>[number];
const CHUNK = 5000;

function isRpcLimitError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message.toLowerCase();
  return msg.includes("limit exceeded") || msg.includes("-32005") || msg.includes("too many results");
}

async function getLogsRangeWithFallback(
  provider: BrowserProvider,
  address: string,
  topics: (string | null)[],
  fromBlock: number,
  toBlock: number,
): Promise<EthersLog[]> {
  try {
    return await provider.getLogs({ address, topics, fromBlock, toBlock });
  } catch (error) {
    if (!isRpcLimitError(error) || fromBlock >= toBlock) {
      throw error;
    }

    // Split the range recursively when RPC rejects the query size.
    const mid = Math.floor((fromBlock + toBlock) / 2);
    const [left, right] = await Promise.all([
      getLogsRangeWithFallback(provider, address, topics, fromBlock, mid),
      getLogsRangeWithFallback(provider, address, topics, mid + 1, toBlock),
    ]);
    return [...left, ...right];
  }
}

async function getLogs(
  provider: BrowserProvider,
  address: string,
  topics: (string | null)[],
  fromBlock: number,
  toBlock: number,
): Promise<EthersLog[]> {
  const all: EthersLog[] = [];
  for (let start = fromBlock; start <= toBlock; start += CHUNK) {
    const end = Math.min(start + CHUNK - 1, toBlock);
    const logs = await getLogsRangeWithFallback(provider, address, topics, start, end);
    all.push(...logs);
  }
  return all;
}

async function blockTimestamps(
  provider: BrowserProvider,
  blockNums: number[],
): Promise<Map<number, number>> {
  const map = new Map<number, number>();
  const unique = [...new Set(blockNums)];
  const BATCH = 10;
  for (let i = 0; i < unique.length; i += BATCH) {
    const slice = unique.slice(i, i + BATCH);
    const results = await Promise.all(slice.map((n) => provider.getBlock(n)));
    results.forEach((b, idx) => {
      if (b) map.set(slice[idx], b.timestamp);
    });
  }
  return map;
}

// ────────────────────────────────────────────────────────
// Core function
// ────────────────────────────────────────────────────────
export async function fetchLeaderboardDay(
  provider: BrowserProvider,
  dayId: number,
): Promise<LeaderboardDay> {
  if (!CORE_CONTRACT_ADDRESS) throw new Error("缺少 VITE_CORE_CONTRACT_ADDRESS 配置");
  const coder = AbiCoder.defaultAbiCoder();

  // Get latest block for time calculations
  const [latestBlock, latestBlockObj] = await Promise.all([
    provider.getBlockNumber(),
    provider.getBlock("latest"),
  ]);
  const latestTs = latestBlockObj?.timestamp ?? Math.floor(Date.now() / 1000);

  // Block range for this day
  const { fromBlock, toBlock } = blockRangeForDay(latestBlock, latestTs, dayId);

  // Query contract for authoritative leaderboard state
  const contract = getCoreContract(provider) as any;
  const [lbResult, poolAcc] = await Promise.all([
    contract.getLeaderboard(dayId),
    contract.poolAccumulated(5),
  ]);

  // Whitelist functions may not exist on older proxy versions — graceful fallback
  let whitelistRaw: string[] = [];
  let adjustPctRaw: bigint = 0n;
  try {
    const [lenRaw, adjustPctResult] = await Promise.all([
      contract.leaderboardWhitelistLength() as Promise<bigint>,
      contract.leaderboardWhitelistAdjustPct() as Promise<bigint>,
    ]);
    adjustPctRaw = adjustPctResult;
    const len = Number(lenRaw);
    if (len > 0) {
      const items = await Promise.all(
        Array.from({ length: len }, (_, i) => contract.leaderboardWhitelist(i) as Promise<string>),
      );
      whitelistRaw = items;
    }
  } catch {
    // not available on this deployment — use defaults
  }

  const topUsers: string[] = Array.from(lbResult.topUsers);
  const topVolumes: bigint[] = Array.from(lbResult.topVolumes);
  const topCount: number = Number(lbResult.topCount);
  const lastUsers: string[] = Array.from(lbResult.lastUsers);
  const lastCount: number = Number(lbResult.lastCount);
  const totalPool = BigInt(poolAcc);
  const whitelist: string[] = Array.from(whitelistRaw);
  const whitelistCount = whitelist.length;
  const adjustPct = Number(adjustPctRaw);

  // Fetch events in parallel
  // Settle events are typically processed within days, limit to 1-2 days buffer
  const settledFromBlock = Math.max(0, toBlock);
  const settledToBlock = Math.min(latestBlock, toBlock + BLOCKS_PER_DAY * 2);
  
  const [settledLogs, luckySettledLogs, purchaseLogs, updatedLogs] = await Promise.all([
    getLogs(
      provider,
      CORE_CONTRACT_ADDRESS,
      [TOPIC_LEADERBOARD_SETTLED, padUint(dayId), null],
      settledFromBlock,
      settledToBlock,
    ),
    getLogs(
      provider,
      CORE_CONTRACT_ADDRESS,
      [TOPIC_LEADERBOARD_LUCKY_SETTLED, padUint(dayId), null],
      settledFromBlock,
      settledToBlock,
    ),
    getLogs(
      provider,
      CORE_CONTRACT_ADDRESS,
      [TOPIC_MACHINE_PURCHASED, null, null, null],
      fromBlock,
      toBlock,
    ),
    getLogs(
      provider,
      CORE_CONTRACT_ADDRESS,
      [TOPIC_LEADERBOARD_UPDATED, padUint(dayId), null],
      fromBlock,
      toBlock,
    ),
  ]);

  // Block timestamps
  const allBlockNums = [
    ...settledLogs.map((l) => l.blockNumber),
    ...luckySettledLogs.map((l) => l.blockNumber),
    ...purchaseLogs.map((l) => l.blockNumber),
    ...updatedLogs.map((l) => l.blockNumber),
  ];
  const tsMap = await blockTimestamps(provider, allBlockNums);

  // Build settled rewards map: address → { amount, timestamp }
  const settledMap = new Map<string, { amount: bigint; ts: number }>();
  for (const log of settledLogs) {
    const user = getAddress("0x" + log.topics[2].slice(26));
    // LeaderboardSettled(dayId, user, rank, amountUSDT) - rank and amount are non-indexed
    // Actually: event LeaderboardSettled(uint256 indexed dayId, address indexed user, uint8 rank, uint256 amountUSDT)
    // data = abi.encode(rank, amountUSDT) — but rank is uint8 = padded to 32 bytes
    const decoded = coder.decode(["uint8", "uint256"], log.data) as unknown as [bigint, bigint];
    const amount = decoded[1];
    settledMap.set(user.toLowerCase(), {
      amount,
      ts: tsMap.get(log.blockNumber) ?? 0,
    });
  }

  // Build lucky (FOMO) settled rewards map: address → { amount, timestamp }
  const luckySettledMap = new Map<string, { amount: bigint; ts: number }>();
  for (const log of luckySettledLogs) {
    const user = getAddress("0x" + log.topics[2].slice(26));
    const decoded = coder.decode(["uint8", "uint256"], log.data) as unknown as [bigint, bigint];
    const amount = decoded[1];
    luckySettledMap.set(user.toLowerCase(), {
      amount,
      ts: tsMap.get(log.blockNumber) ?? 0,
    });
  }

  // Build LeaderboardUpdated map: address → latest timestamp
  const updatedTsMap = new Map<string, number>();
  for (const log of updatedLogs) {
    const user = getAddress("0x" + log.topics[2].slice(26)).toLowerCase();
    const ts = tsMap.get(log.blockNumber) ?? 0;
    const existing = updatedTsMap.get(user) ?? 0;
    if (ts > existing) updatedTsMap.set(user, ts);
  }

  // Build MachinePurchased map: user → array of { amount, blockNum, ts }
  type PurchaseEntry = { amount: bigint; blockNum: number; ts: number };
  const purchaseMap = new Map<string, PurchaseEntry[]>();
  for (const log of purchaseLogs) {
    const user = getAddress("0x" + log.topics[1].slice(26)).toLowerCase();
    const [, amountUSDT] = coder.decode(["uint256", "uint256"], log.data) as unknown as [bigint, bigint];
    const ts = tsMap.get(log.blockNumber) ?? 0;
    if (!purchaseMap.has(user)) purchaseMap.set(user, []);
    purchaseMap.get(user)!.push({ amount: amountUSDT, blockNum: log.blockNumber, ts });
  }

  // Pool split follows on-chain settle logic:
  // both lists exist => top 75%, lucky 25%; otherwise winner takes all.
  let topSegment = 0n;
  let luckySegment = 0n;
  if (topCount === 0) {
    luckySegment = totalPool;
  } else if (lastCount === 0) {
    topSegment = totalPool;
  } else {
    topSegment = (totalPool * 7500n) / 10000n;
    luckySegment = totalPool - topSegment;
  }

  const whitelistEnabled = whitelistCount > 0 && adjustPct > 0;
  const adjustedFirstShare = Math.max(0, RANK_SHARES[0] - adjustPct * 100);

  // ── Top10 entries ──
  const topWhitelistAmount = whitelistEnabled ? (topSegment * BigInt(adjustPct)) / 100n : 0n;
  const topRankTotal = topSegment - topWhitelistAmount;
  const topShareDenom = RANK_SHARES
    .slice(0, topCount)
    .reduce((sum, share, index) => sum + (index === 0 ? adjustedFirstShare : share), 0);

  const top10: TopEntry[] = [];
  let topDistributed = 0n;
  for (let i = 0; i < topCount; i++) {
    const addr = topUsers[i];
    if (!addr || addr === "0x0000000000000000000000000000000000000000") continue;
    const addrLow = addr.toLowerCase();
    const settled = settledMap.get(addrLow);
    const rankShare = i === 0 ? adjustedFirstShare : RANK_SHARES[i];
    
    // Mirror contract logic: last rank gets remainder to avoid rounding loss
    let estimatedReward = 0n;
    if (topShareDenom > 0) {
      if (i === topCount - 1) {
        // Last entry: gets all remaining
        estimatedReward = topRankTotal - topDistributed;
      } else {
        // Other entries: calculated by proportion
        estimatedReward = (topRankTotal * BigInt(rankShare)) / BigInt(topShareDenom);
      }
    }
    if (estimatedReward > 0n) {
      topDistributed += estimatedReward;
    }
    
    top10.push({
      rank: i + 1,
      address: addr,
      totalVolume: topVolumes[i],
      rewardAmount: settled ? settled.amount : estimatedReward > 0n ? estimatedReward : null,
      timestamp: settled?.ts ?? updatedTsMap.get(addrLow) ?? 0,
    });
  }

  // ── FOMO last10 entries ──
  // Contract settles lastUsers[0..lastCount-1] in order: i=0 gets rankShares[0] (highest).
  // lastUsers array is a sliding window where lastUsers[lastCount-1] = most recently added.
  // So lastUsers[0] = oldest surviving buyer = rank 1 in contract payout order.
  const luckyWhitelistAmount = whitelistEnabled ? (luckySegment * BigInt(adjustPct)) / 100n : 0n;
  const luckyRankTotal = luckySegment - luckyWhitelistAmount;
  const luckyShareDenom = RANK_SHARES
    .slice(0, lastCount)
    .reduce((sum, share, index) => sum + (index === 0 ? adjustedFirstShare : share), 0);

  const last10: FomoEntry[] = [];
  // Iterate in contract order: i=0 → rank 1 (highest share), i=lastCount-1 → rank lastCount (lowest share)
  // Accumulate distributed amounts to avoid rounding errors; last entry gets remainder
  let luckyDistributed = 0n;
  for (let i = 0; i < lastCount; i++) {
    const addr = lastUsers[i];
    if (!addr || addr === "0x0000000000000000000000000000000000000000") continue;
    const addrLow = addr.toLowerCase();
    const rank = i + 1;

    // Most recent purchase by this user in the day range
    const purchases = purchaseMap.get(addrLow) ?? [];
    const mostRecent = purchases.sort((a, b) => b.blockNum - a.blockNum)[0];
    const purchaseAmount = mostRecent?.amount ?? 0n;
    const ts = mostRecent?.ts ?? updatedTsMap.get(addrLow) ?? 0;

    const luckySettled = luckySettledMap.get(addrLow);
    
    // Mirror contract logic: last rank gets remainder to avoid rounding loss
    let fomoShare = 0n;
    if (luckyShareDenom > 0) {
      if (i === lastCount - 1) {
        // Last entry: gets all remaining
        fomoShare = luckyRankTotal - luckyDistributed;
      } else {
        // Other entries: calculated by proportion
        const rankShare = i === 0 ? adjustedFirstShare : RANK_SHARES[i];
        fomoShare = (luckyRankTotal * BigInt(rankShare)) / BigInt(luckyShareDenom);
      }
    }
    if (fomoShare > 0n) {
      luckyDistributed += fomoShare;
    }

    last10.push({
      rank,
      address: addr,
      purchaseAmount,
      rewardAmount: luckySettled ? luckySettled.amount : fomoShare > 0n ? fomoShare : null,
      timestamp: luckySettled?.ts ?? ts,
    });
  }

  return { dayId, top10, last10, totalPool };
}

export { currentDayId };
