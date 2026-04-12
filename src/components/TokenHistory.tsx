import { BrowserProvider, isAddress } from "ethers";
import { useCallback, useState } from "react";
import {
    CORE_CONTRACT_ADDRESS,
    ICO_TOKEN_ADDRESS,
    LIGHT_TOKEN_ADDRESS,
    OTC_CONTRACT_ADDRESS,
    SWAP_POOL_ADDRESS,
    USDT_CONTRACT_ADDRESS,
} from "../config";
import { formatTokenAmount } from "../lib/tokenContract";
import type { TxRecord } from "../lib/tokenHistory";
import { fetchTokenHistory } from "../lib/tokenHistory";
import { formatUsdt } from "../lib/usdtContract";

export type TokenType = "ICO" | "LIGHT" | "USDT";

interface Props {
  tokenType: TokenType;
  userAddress: string;
  provider: BrowserProvider;
  onBack: () => void;
  lang: "zh" | "en";
}

const PAGE_SIZE = 20;
// BSC ~3 seconds per block
const BLOCK_TIME_SEC = 3;
const MAX_LOOKBACK_DAYS = 14;

const TITLE: Record<TokenType, [string, string]> = {
  ICO: ["ICO钱包流水", "ICO History"],
  LIGHT: ["Light钱包流水", "Light History"],
  USDT: ["USDT钱包流水", "USDT History"],
};

function formatAmount(amount: bigint, token: TokenType): string {
  if (token === "USDT") return formatUsdt(amount);
  return formatTokenAmount(amount, 18);
}

function formatDateTime(ts: number): string {
  if (!ts) return "—";
  const d = new Date(ts * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function toDatetimeLocal(ts: number): string {
  const d = new Date(ts * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function nowSec() {
  return Math.floor(Date.now() / 1000);
}

function normalizeHistoryError(error: unknown, zh: boolean): string {
  const fallback = zh ? "查询失败，请稍后重试。" : "Query failed. Please try again.";
  if (!(error instanceof Error)) return fallback;

  const msg = error.message.toLowerCase();
  if (msg.includes("limit exceeded") || msg.includes("-32005") || msg.includes("too many results")) {
    return zh ? "链上节点繁忙，请缩短时间范围后重试。" : "RPC is busy. Please narrow time range and retry.";
  }
  if (msg.includes("timeout") || msg.includes("network") || msg.includes("failed to fetch")) {
    return zh ? "网络波动，请稍后重试。" : "Network is unstable. Please retry shortly.";
  }
  return fallback;
}

export function TokenHistory({ tokenType, userAddress, provider, onBack, lang }: Props) {
  const zh = lang === "zh";
  const [startDT, setStartDT] = useState(() => toDatetimeLocal(nowSec() - 7 * 24 * 3600));
  const [endDT, setEndDT] = useState(() => toDatetimeLocal(nowSec()));
  const [queryAddress, setQueryAddress] = useState(userAddress);
  const [records, setRecords] = useState<TxRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [page, setPage] = useState(1);

  const onQuery = useCallback(async () => {
    setErr("");
    setLoading(true);
    setPage(1);
    try {
      const tokenAddress =
        tokenType === "ICO"
          ? ICO_TOKEN_ADDRESS
          : tokenType === "LIGHT"
            ? LIGHT_TOKEN_ADDRESS
            : USDT_CONTRACT_ADDRESS;
      if (!tokenAddress) throw new Error(zh ? "代币地址未配置" : "Token address not configured");
      if (!isAddress(queryAddress)) {
        throw new Error(zh ? "查询地址格式不正确" : "Invalid query address");
      }

      const latestBlock = await provider.getBlockNumber();
      const nowTs = nowSec();
      const startTs = startDT ? Math.floor(new Date(startDT).getTime() / 1000) : nowTs - 7 * 24 * 3600;
      const endTs = endDT ? Math.floor(new Date(endDT).getTime() / 1000) : nowTs;
      if (endTs < startTs) {
        throw new Error(zh ? "结束时间不能早于开始时间" : "End time cannot be earlier than start time");
      }
      if (endTs - startTs > MAX_LOOKBACK_DAYS * 24 * 3600) {
        throw new Error(
          zh
            ? `查询时间范围不能超过 ${MAX_LOOKBACK_DAYS} 天`
            : `Time range cannot exceed ${MAX_LOOKBACK_DAYS} days`,
        );
      }

      const blocksBack_start = Math.ceil((nowTs - startTs) / BLOCK_TIME_SEC);
      const blocksBack_end = Math.ceil((nowTs - endTs) / BLOCK_TIME_SEC);
      const fromBlock = Math.max(0, latestBlock - blocksBack_start);
      const toBlock = Math.max(fromBlock, latestBlock - Math.max(0, blocksBack_end));

      const refs = {
        core: (CORE_CONTRACT_ADDRESS || "").toLowerCase(),
        swap: (SWAP_POOL_ADDRESS || "").toLowerCase(),
        otc: (OTC_CONTRACT_ADDRESS || "").toLowerCase(),
      };

      const result = await fetchTokenHistory(
        provider,
        tokenAddress,
        queryAddress,
        tokenType,
        refs,
        fromBlock,
        toBlock,
      );
      setRecords(result);
    } catch (e: unknown) {
      setErr(normalizeHistoryError(e, zh));
    } finally {
      setLoading(false);
    }
  }, [tokenType, queryAddress, provider, startDT, endDT, zh]);

  const onReset = () => {
    setStartDT(toDatetimeLocal(nowSec() - 7 * 24 * 3600));
    setEndDT(toDatetimeLocal(nowSec()));
    setQueryAddress(userAddress);
    setRecords([]);
    setPage(1);
    setErr("");
  };

  const shown = records.slice(0, page * PAGE_SIZE);
  const hasMore = shown.length < records.length;

  const [titleZh, titleEn] = TITLE[tokenType];
  const title = zh ? titleZh : titleEn;

  return (
    <div className="history-page">
      {/* Header */}
      <div className="history-header">
        <button className="history-back-btn" type="button" onClick={onBack}>
          ‹ {zh ? "返回" : "Back"}
        </button>
        <h2 className="history-title">{title}</h2>

        {/* Date filter */}
        <div className="history-filter">
          <label className="history-filter-row">
            <span>{zh ? "查询地址：" : "Address:"}</span>
            <input
              type="text"
              value={queryAddress}
              onChange={(e) => setQueryAddress(e.target.value)}
              className="history-date-input"
              placeholder="0x..."
            />
          </label>
          <div className="history-filter-btns">
            <button
              className="history-reset-btn"
              type="button"
              onClick={() => setQueryAddress(userAddress)}
            >
              {zh ? "当前钱包" : "Use Wallet"}
            </button>
          </div>
          <label className="history-filter-row">
            <span>{zh ? "开始时间：" : "Start:"}</span>
            <input
              type="datetime-local"
              value={startDT}
              onChange={(e) => setStartDT(e.target.value)}
              className="history-date-input"
            />
          </label>
          <label className="history-filter-row">
            <span>{zh ? "结束时间：" : "End:"}</span>
            <input
              type="datetime-local"
              value={endDT}
              onChange={(e) => setEndDT(e.target.value)}
              className="history-date-input"
            />
          </label>
          <div className="history-filter-btns">
            <button className="history-reset-btn" type="button" onClick={onReset}>
              {zh ? "重置" : "Reset"}
            </button>
            <button
              className="history-query-btn"
              type="button"
              onClick={onQuery}
              disabled={loading}
            >
              {loading ? (zh ? "查询中…" : "Loading…") : zh ? "查询" : "Query"}
            </button>
          </div>
        </div>
      </div>

      {/* List */}
      <div className="history-list">
        {!loading && err && <p className="history-msg history-err">{err}</p>}
        {!loading && !err && records.length === 0 && (
          <p className="history-msg">{zh ? "暂无记录，请点击查询。" : "No records. Click Query."}</p>
        )}

        {shown.map((r, i) => (
          <div key={`${r.txHash}-${i}`} className="history-item">
            <div className="hi-row">
              <span className="hi-label">{zh ? "订单ID：" : "TxHash:"}</span>
              <a
                className="hi-hash"
                href={`https://testnet.bscscan.com/tx/${r.txHash}`}
                target="_blank"
                rel="noreferrer"
              >
                {r.txHash.slice(0, 10)}…
              </a>
            </div>
            <div className="hi-row">
              <span className="hi-date">{formatDateTime(r.timestamp)}</span>
            </div>
            <div className="hi-row hi-amount-row">
              <span className={`hi-amount ${r.direction === "in" ? "hi-pos" : "hi-neg"}`}>
                {r.direction === "in" ? "+" : "−"}
                {formatAmount(r.amount, r.token)}
              </span>
              <span className="hi-symbol">{r.token}</span>
            </div>
            <div className="hi-row">
              <span className="hi-label">{zh ? "订单类型：" : "Type:"}</span>
              <span className="hi-type">{r.orderType}</span>
            </div>
          </div>
        ))}

        {!loading && hasMore && (
          <button className="history-more-btn" type="button" onClick={() => setPage((p) => p + 1)}>
            {zh ? "更多" : "Load more"}
          </button>
        )}
      </div>
    </div>
  );
}
