import { AbiCoder, BrowserProvider, getAddress, id as keccak256id, zeroPadValue } from "ethers";

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

// BSC Testnet public RPC limits getLogs to ~5000 blocks per request
const CHUNK = 5000;

function padAddr(addr: string): string {
  return zeroPadValue(addr.toLowerCase(), 32);
}

function classifyOrder(
  token: "ICO" | "LIGHT" | "USDT",
  direction: TxDirection,
  counterparty: string,
  refs: { core: string; swap: string; otc: string },
): string {
  const cp = counterparty.toLowerCase();
  const { core, swap, otc } = refs;

  if (token === "USDT") {
    if (direction === "out") {
      if (cp === core) return "购买算力";
      if (cp === swap) return "买入ICO";
      if (cp === otc) return "OTC付款";
      return "转出";
    }
    if (cp === core) return "奖励发放";
    if (cp === swap) return "卖出ICO";
    if (cp === otc) return "OTC收款";
    return "转入";
  }

  if (token === "ICO") {
    if (direction === "out") {
      if (cp === swap) return "Light兑换";
      if (cp === otc) return "卖出ICO";
      return "转出ICO";
    }
    if (cp === swap) return "买入ICO";
    if (cp === core) return "ICO奖励";
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
  topic0: string,
  topicFrom: string | null,
  topicTo: string | null,
  fromBlock: number,
  toBlock: number,
): Promise<EthersLog[]> {
  const all: EthersLog[] = [];
  for (let from = fromBlock; from <= toBlock; from += CHUNK) {
    const to = Math.min(from + CHUNK - 1, toBlock);
    const logs = await getLogsRangeWithFallback(provider, address, [topic0, topicFrom, topicTo], from, to);
    all.push(...logs);
  }
  return all;
}

export async function fetchTokenHistory(
  provider: BrowserProvider,
  tokenAddress: string,
  userAddress: string,
  token: "ICO" | "LIGHT" | "USDT",
  refs: { core: string; swap: string; otc: string },
  fromBlock: number,
  toBlock: number,
): Promise<TxRecord[]> {
  const padded = padAddr(userAddress);

  const [outLogs, inLogs] = await Promise.all([
    getLogsChunked(provider, tokenAddress, TRANSFER_TOPIC, padded, null, fromBlock, toBlock),
    getLogsChunked(provider, tokenAddress, TRANSFER_TOPIC, null, padded, fromBlock, toBlock),
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

  // Fetch block timestamps in parallel batches of 10
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
