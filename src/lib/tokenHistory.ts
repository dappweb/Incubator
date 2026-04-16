import { AbiCoder, BrowserProvider, getAddress, id as keccak256id, toBeHex, zeroPadValue } from "ethers";

export type TxDirection = "in" | "out";

export interface TxRecord {
  txHash: string;
  blockNumber: number;
  timestamp: number; // unix seconds; 0 until filled
  amount: bigint;
  direction: TxDirection;
  counterparty: string;
  orderType: string;
  token: "ICO" | "LIGHT" | "USDT";
}

const TRANSFER_TOPIC = keccak256id("Transfer(address,address,uint256)");

// PoolAllocated(uint256 indexed orderId, uint8 indexed poolType, address indexed recipient, address token, uint256 amountUSDT)
const POOL_ALLOCATED_TOPIC = keccak256id("PoolAllocated(uint256,uint8,address,address,uint256)");
// OrderRewardDistributed(uint256 indexed dayId, uint256 indexed orderId, address indexed beneficiary, uint256, uint256, uint256, uint256)
const ORDER_REWARD_TOPIC = keccak256id("OrderRewardDistributed(uint256,uint256,address,uint256,uint256,uint256,uint256)");
// LeaderboardSettled(uint256 indexed dayId, address indexed user, uint8 rank, uint256 amountUSDT)
const LEADERBOARD_SETTLED_TOPIC = keccak256id("LeaderboardSettled(uint256,address,uint8,uint256)");
// LeaderboardLuckySettled(uint256 indexed dayId, address indexed user, uint8 luckyRank, uint256 amountUSDT)
const LEADERBOARD_LUCKY_TOPIC = keccak256id("LeaderboardLuckySettled(uint256,address,uint8,uint256)");
// LeaderboardWhitelistSettled(uint256 indexed dayId, address indexed user, bool indexed isTopPool, uint256 amountUSDT)
const LEADERBOARD_WL_TOPIC = keccak256id("LeaderboardWhitelistSettled(uint256,address,bool,uint256)");
// PoolRewardSettled(uint8 indexed poolType, address indexed beneficiary, uint256 amountUSDT)
const POOL_REWARD_SETTLED_TOPIC = keccak256id("PoolRewardSettled(uint8,address,uint256)");
// NodePurchased(address indexed user, uint256 amountUSDT, uint256 indexed identityId)
const NODE_PURCHASED_TOPIC = keccak256id("NodePurchased(address,uint256,uint256)");
// SuperNodePurchased(address indexed user, uint256 amountUSDT, uint256 indexed identityId)
const SUPER_NODE_PURCHASED_TOPIC = keccak256id("SuperNodePurchased(address,uint256,uint256)");

const POOL_TYPE_REFERRAL = 1;
const NODE_ORDER_PREFIX = 1_000_000_000;
const SUPER_NODE_ORDER_PREFIX = 2_000_000_000;

// Public CNC RPC can time out on large getLogs windows, so keep requests chunked.
const CHUNK = 5000;

function padAddr(addr: string): string {
  return zeroPadValue(addr.toLowerCase(), 32);
}

function classifyOrder(
  token: "ICO" | "LIGHT" | "USDT",
  direction: TxDirection,
  counterparty: string,
  refs: { core: string; swap: string; otc: string; psc?: string },
): string {
  const cp = counterparty.toLowerCase();
  const { core, swap, otc, psc } = refs;

  if (token === "USDT") {
    if (direction === "out") {
      if (cp === core) return "购买算力";
      if (cp === swap) return "买入ICO";
      if (cp === otc) return "OTC付款";
      if (psc && cp === psc) return "一级市场买入";
      return "转出";
    }
    if (cp === core) return "奖励发放";
    if (cp === swap) return "卖出ICO";
    if (cp === otc) return "OTC收款";
    if (psc && cp === psc) return "一级市场收款";
    return "转入";
  }

  if (token === "ICO") {
    if (direction === "out") {
      if (cp === swap) return "Light兑换";
      if (cp === otc) return "卖出ICO";
      if (psc && cp === psc) return "一级市场卖出";
      return "转出ICO";
    }
    if (cp === swap) return "买入ICO";
    if (cp === core) return "ICO奖励";
    if (psc && cp === psc) return "一级市场买入";
    return "转入ICO";
  }

  // LIGHT
  if (direction === "in") {
    if (cp === swap) return "Light兑换";
    if (cp === core) return "Light收益";
    return "Light转入";
  }
  return "Light转出";
}

type EthersLog = Awaited<ReturnType<BrowserProvider["getLogs"]>>[number];

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

    // Split range recursively when RPC rejects this span.
    const mid = Math.floor((fromBlock + toBlock) / 2);
    const [left, right] = await Promise.all([
      getLogsRangeWithFallback(provider, address, topics, fromBlock, mid),
      getLogsRangeWithFallback(provider, address, topics, mid + 1, toBlock),
    ]);
    return [...left, ...right];
  }
}

async function getLogsChunked(
  provider: BrowserProvider,
  address: string,
  topics: (string | null)[],
  fromBlock: number,
  toBlock: number,
): Promise<EthersLog[]> {
  const all: EthersLog[] = [];
  for (let from = fromBlock; from <= toBlock; from += CHUNK) {
    const to = Math.min(from + CHUNK - 1, toBlock);
    const logs = await getLogsRangeWithFallback(provider, address, topics, from, to);
    all.push(...logs);
  }
  return all;
}

export async function fetchTokenHistory(
  provider: BrowserProvider,
  tokenAddress: string,
  userAddress: string,
  token: "ICO" | "LIGHT" | "USDT",
  refs: { core: string; swap: string; otc: string; psc?: string },
  fromBlock: number,
  toBlock: number,
  onProgress?: (phase: string) => void,
): Promise<TxRecord[]> {
  const padded = padAddr(userAddress);

  onProgress?.("扫描链上转账记录…");
  const [outLogs, inLogs] = await Promise.all([
    getLogsChunked(provider, tokenAddress, [TRANSFER_TOPIC, padded, null], fromBlock, toBlock),
    getLogsChunked(provider, tokenAddress, [TRANSFER_TOPIC, null, padded], fromBlock, toBlock),
  ]);

  const abiCoder = AbiCoder.defaultAbiCoder();
  const records: TxRecord[] = [];
  const blockSet = new Set<number>();

  for (const log of outLogs) {
    const amount = abiCoder.decode(["uint256"], log.data)[0] as bigint;
    const toAddr = getAddress("0x" + log.topics[2].slice(26));
    if (toAddr.toLowerCase() === userAddress.toLowerCase()) continue;
    records.push({
      txHash: log.transactionHash,
      blockNumber: log.blockNumber,
      timestamp: 0,
      amount,
      direction: "out",
      counterparty: toAddr,
      orderType: classifyOrder(token, "out", toAddr, refs),
      token,
    });
    blockSet.add(log.blockNumber);
  }

  for (const log of inLogs) {
    const amount = abiCoder.decode(["uint256"], log.data)[0] as bigint;
    const fromAddr = getAddress("0x" + log.topics[1].slice(26));
    if (fromAddr.toLowerCase() === userAddress.toLowerCase()) continue;
    records.push({
      txHash: log.transactionHash,
      blockNumber: log.blockNumber,
      timestamp: 0,
      amount,
      direction: "in",
      counterparty: fromAddr,
      orderType: classifyOrder(token, "in", fromAddr, refs),
      token,
    });
    blockSet.add(log.blockNumber);
  }

  // Sort descending by block number
  records.sort((a, b) => b.blockNumber - a.blockNumber);

  // Reclassify generic "奖励发放" entries using Core contract events
  onProgress?.("分类交易类型…");
  if (token === "USDT" && refs.core) {
    await Promise.all([
      reclassifyCoreRewards(provider, records, userAddress, refs.core, fromBlock, toBlock),
      reclassifyCorePurchases(provider, records, userAddress, refs.core, fromBlock, toBlock),
    ]);
  }

  // Fetch block timestamps in parallel batches of 10
  onProgress?.("获取时间戳…");
  const blockNums = Array.from(blockSet);
  const timestampMap = new Map<number, number>();
  const BATCH = 10;
  for (let i = 0; i < blockNums.length; i += BATCH) {
    const slice = blockNums.slice(i, i + BATCH);
    const results = await Promise.all(slice.map((bn) => provider.getBlock(bn)));
    results.forEach((b, idx) => {
      if (b) timestampMap.set(slice[idx], b.timestamp);
    });
  }

  for (const r of records) {
    r.timestamp = timestampMap.get(r.blockNumber) ?? 0;
  }

  return records;
}

// ── Core event reclassification ──────────────────────────────────────────────

interface CoreEventHint {
  txHash: string;
  amount: bigint;
  label: string;
}

function classifyPoolAllocated(orderId: bigint): string {
  const id = Number(orderId);
  if (id >= SUPER_NODE_ORDER_PREFIX) return "超级节点推荐奖";
  if (id >= NODE_ORDER_PREFIX) return "节点推荐奖";
  return "算力直推奖";
}

async function reclassifyCoreRewards(
  provider: BrowserProvider,
  records: TxRecord[],
  userAddress: string,
  coreAddress: string,
  fromBlock: number,
  toBlock: number,
): Promise<void> {
  // Only reclassify records that are generic "奖励发放"
  const genericRecords = records.filter(
    (r) => r.orderType === "奖励发放" || r.orderType === "Reward",
  );
  if (genericRecords.length === 0) return;

  const paddedUser = padAddr(userAddress);
  const abiCoder = AbiCoder.defaultAbiCoder();
  const hints: CoreEventHint[] = [];

  // Fetch all relevant events in parallel
  const [poolAllocLogs, orderRewardLogs, lbSettledLogs, lbLuckyLogs, lbWlLogs, poolRewardLogs] =
    await Promise.all([
      // PoolAllocated where poolType (topic[2]) = Referral (1), then filter recipient
      getLogsChunked(
        provider, coreAddress,
        [POOL_ALLOCATED_TOPIC, null, toBeHex(POOL_TYPE_REFERRAL, 32)],
        fromBlock, toBlock,
      ).then((logs) => logs.filter((l) => l.topics[3]?.toLowerCase() === paddedUser)),

      // OrderRewardDistributed where beneficiary (topic[3]) = user
      getLogsChunked(
        provider, coreAddress,
        [ORDER_REWARD_TOPIC, null, null, paddedUser],
        fromBlock, toBlock,
      ),

      // LeaderboardSettled where user (topic[2]) = user
      getLogsChunked(
        provider, coreAddress,
        [LEADERBOARD_SETTLED_TOPIC, null, paddedUser],
        fromBlock, toBlock,
      ),

      // LeaderboardLuckySettled where user (topic[2]) = user
      getLogsChunked(
        provider, coreAddress,
        [LEADERBOARD_LUCKY_TOPIC, null, paddedUser],
        fromBlock, toBlock,
      ),

      // LeaderboardWhitelistSettled where user (topic[2]) = user
      getLogsChunked(
        provider, coreAddress,
        [LEADERBOARD_WL_TOPIC, null, paddedUser],
        fromBlock, toBlock,
      ),

      // PoolRewardSettled where beneficiary (topic[2]) = user
      getLogsChunked(
        provider, coreAddress,
        [POOL_REWARD_SETTLED_TOPIC, null, paddedUser],
        fromBlock, toBlock,
      ),
    ]);

  // Parse PoolAllocated → referral rewards
  for (const log of poolAllocLogs) {
    const orderId = BigInt(log.topics[1]);
    const decoded = abiCoder.decode(["address", "uint256"], log.data);
    const amount = decoded[1] as bigint;
    hints.push({ txHash: log.transactionHash, amount, label: classifyPoolAllocated(orderId) });
  }

  // Parse OrderRewardDistributed → daily rewards (static + dynamic packed in data)
  for (const log of orderRewardLogs) {
    const decoded = abiCoder.decode(["uint256", "uint256", "uint256", "uint256"], log.data);
    const staticAmt = decoded[0] as bigint;
    const dynamicAmt = decoded[1] as bigint;
    const total = staticAmt + dynamicAmt;
    if (total > 0n) {
      hints.push({ txHash: log.transactionHash, amount: total, label: "日结奖励(LIGHT)" });
    }
  }

  // Parse LeaderboardSettled → top ranking rewards
  for (const log of lbSettledLogs) {
    const decoded = abiCoder.decode(["uint8", "uint256"], log.data);
    const amount = decoded[1] as bigint;
    hints.push({ txHash: log.transactionHash, amount, label: "日榜奖励" });
  }

  // Parse LeaderboardLuckySettled → lucky ranking rewards
  for (const log of lbLuckyLogs) {
    const decoded = abiCoder.decode(["uint8", "uint256"], log.data);
    const amount = decoded[1] as bigint;
    hints.push({ txHash: log.transactionHash, amount, label: "幸运榜奖励" });
  }

  // Parse LeaderboardWhitelistSettled → whitelist rewards
  for (const log of lbWlLogs) {
    const decoded = abiCoder.decode(["uint256"], log.data);
    const amount = decoded[0] as bigint;
    hints.push({ txHash: log.transactionHash, amount, label: "排行榜白名单" });
  }

  // Parse PoolRewardSettled → node/super-node pool settlement
  for (const log of poolRewardLogs) {
    const poolType = Number(BigInt(log.topics[1]));
    const decoded = abiCoder.decode(["uint256"], log.data);
    const amount = decoded[0] as bigint;
    const poolLabels: Record<number, string> = {
      2: "超级节点池结算",
      3: "节点池结算",
    };
    hints.push({ txHash: log.transactionHash, amount, label: poolLabels[poolType] || "池结算" });
  }

  // Build lookup: txHash → hints
  const hintMap = new Map<string, CoreEventHint[]>();
  for (const h of hints) {
    const key = h.txHash.toLowerCase();
    const list = hintMap.get(key) ?? [];
    list.push(h);
    hintMap.set(key, list);
  }

  // Reclassify records
  for (const r of genericRecords) {
    const txHints = hintMap.get(r.txHash.toLowerCase());
    if (!txHints || txHints.length === 0) continue;

    // Try exact amount match first
    const exact = txHints.find((h) => h.amount === r.amount);
    if (exact) {
      r.orderType = exact.label;
      continue;
    }

    // For daily rewards, the USDT transfer per user is the sum of all order distributions in that tx.
    // If the sum of all "日结奖励(LIGHT)" hints in this tx equals the record amount, use that label.
    const dailyHints = txHints.filter((h) => h.label === "日结奖励(LIGHT)");
    if (dailyHints.length > 0) {
      const dailySum = dailyHints.reduce((s, h) => s + h.amount, 0n);
      if (dailySum === r.amount) {
        r.orderType = "日结奖励(LIGHT)";
        continue;
      }
    }

    // Fallback: use the first hint's label
    r.orderType = txHints[0].label;
  }
}

// ── Purchase type reclassification ───────────────────────────────────────────

async function reclassifyCorePurchases(
  provider: BrowserProvider,
  records: TxRecord[],
  userAddress: string,
  coreAddress: string,
  fromBlock: number,
  toBlock: number,
): Promise<void> {
  // Only reclassify "购买算力" records (USDT out to Core)
  const purchaseRecords = records.filter((r) => r.orderType === "购买算力");
  if (purchaseRecords.length === 0) return;

  const paddedUser = padAddr(userAddress);

  // Query NodePurchased and SuperNodePurchased events for this user
  const [nodeLogs, superNodeLogs] = await Promise.all([
    getLogsChunked(provider, coreAddress, [NODE_PURCHASED_TOPIC, paddedUser], fromBlock, toBlock),
    getLogsChunked(provider, coreAddress, [SUPER_NODE_PURCHASED_TOPIC, paddedUser], fromBlock, toBlock),
  ]);

  const purchaseTxLabels = new Map<string, string>();
  for (const log of nodeLogs) {
    purchaseTxLabels.set(log.transactionHash.toLowerCase(), "购买节点");
  }
  for (const log of superNodeLogs) {
    purchaseTxLabels.set(log.transactionHash.toLowerCase(), "购买超级节点");
  }

  for (const r of purchaseRecords) {
    const label = purchaseTxLabels.get(r.txHash.toLowerCase());
    if (label) {
      r.orderType = label;
    }
  }
}
