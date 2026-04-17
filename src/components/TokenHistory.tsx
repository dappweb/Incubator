import { BrowserProvider, isAddress } from "ethers";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    CNC_MAINNET_BLOCK_EXPLORER_URL,
    CORE_CONTRACT_ADDRESS,
    ICO_TOKEN_ADDRESS,
    LIGHT_TOKEN_ADDRESS,
    OTC_CONTRACT_ADDRESS,
    PRIMARY_SWAP_CONTROLLER_ADDRESS,
    SWAP_POOL_ADDRESS,
} from "../config";
import { formatTokenAmount } from "../lib/tokenContract";
import type { TxRecord } from "../lib/tokenHistory";
import { fetchTokenHistory } from "../lib/tokenHistory";
import { formatUsdt, resolveUsdtAddress } from "../lib/usdtContract";

export type TokenType = "ICO" | "LIGHT" | "USDT";

interface Props {
  tokenType: TokenType;
  userAddress: string;
  provider: BrowserProvider;
  onBack: () => void;
  lang: "zh" | "en";
}

const PAGE_SIZE = 20;
// CNC ~3 seconds per block
const BLOCK_TIME_SEC = 3;
const MAX_LOOKBACK_DAYS = 14;

const TITLE: Record<TokenType, [string, string]> = {
  ICO: ["ICO钱包流水", "ICO History"],
  LIGHT: ["Light钱包流水", "Light History"],
  USDT: ["USDT钱包流水", "USDT History"],
};

const TYPE_COLORS: Record<string, string> = {
  "购买算力": "#4facfe",
  "购买节点": "#7c3aed",
  "购买超级节点": "#a855f7",
  "算力直推奖": "#52c41a",
  "节点推荐奖": "#13c2c2",
  "超级节点推荐奖": "#722ed1",
  "日结奖励": "#faad14",
  "日榜奖励": "#fa8c16",
  "幸运榜奖励": "#eb2f96",
  "排行榜白名单": "#f759ab",
  "池结算": "#1890ff",
  "超级节点池结算": "#2f54eb",
  "节点池结算": "#36cfc9",
  "买入ICO": "#00b96b",
  "卖出ICO": "#ff7a45",
  "一级市场卖出": "#ff7a45",
  "一级市场收款": "#52c41a",
  "一级市场买入": "#4facfe",
  "OTC付款": "#ff4d4f",
  "OTC收款": "#52c41a",
  "Light兑换": "#597ef7",
  "ICO奖励": "#73d13d",
  "Light收益": "#9254de",
  "奖励发放": "#fadb14",
  "转入": "#52c41a",
  "转出": "#ff4d4f",
  "转入ICO": "#52c41a",
  "转出ICO": "#ff4d4f",
  "Light转入": "#52c41a",
  "Light转出": "#ff4d4f",
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
  const [loadingMsg, setLoadingMsg] = useState("");
  const [err, setErr] = useState("");
  const [page, setPage] = useState(1);
  const [filterType, setFilterType] = useState("");
  const didAutoLoad = useRef(false);

  const onQuery = useCallback(async () => {
    setErr("");
    setLoading(true);
    setLoadingMsg(zh ? "准备查询…" : "Preparing…");
    setPage(1);
    setFilterType("");
    try {
      const tokenAddress =
        tokenType === "ICO"
          ? ICO_TOKEN_ADDRESS
          : tokenType === "LIGHT"
            ? LIGHT_TOKEN_ADDRESS
            : await resolveUsdtAddress(provider);
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
        psc: (PRIMARY_SWAP_CONTROLLER_ADDRESS || "").toLowerCase(),
      };

      const result = await fetchTokenHistory(
        provider,
        tokenAddress,
        queryAddress,
        tokenType,
        refs,
        fromBlock,
        toBlock,
        (phase) => setLoadingMsg(phase),
      );
      setRecords(result);
    } catch (e: unknown) {
      setErr(normalizeHistoryError(e, zh));
    } finally {
      setLoading(false);
      setLoadingMsg("");
    }
  }, [tokenType, queryAddress, provider, startDT, endDT, zh]);

  // Auto-load on mount
  useEffect(() => {
    if (!didAutoLoad.current) {
      didAutoLoad.current = true;
      onQuery();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const onReset = () => {
    setStartDT(toDatetimeLocal(nowSec() - 7 * 24 * 3600));
    setEndDT(toDatetimeLocal(nowSec()));
    setQueryAddress(userAddress);
    setRecords([]);
    setPage(1);
    setErr("");
    setFilterType("");
  };

  // Derived data
  const orderTypes = useMemo(() => {
    const set = new Set<string>();
    for (const r of records) set.add(r.orderType);
    return Array.from(set).sort();
  }, [records]);

  const filtered = useMemo(
    () => (filterType ? records.filter((r) => r.orderType === filterType) : records),
    [records, filterType],
  );

  const summary = useMemo(() => {
    let totalIn = 0n;
    let totalOut = 0n;
    for (const r of filtered) {
      if (r.direction === "in") totalIn += r.amount;
      else totalOut += r.amount;
    }
    return { totalIn, totalOut, count: filtered.length };
  }, [filtered]);

  const shown = filtered.slice(0, page * PAGE_SIZE);
  const hasMore = shown.length < filtered.length;

  const [titleZh, titleEn] = TITLE[tokenType];
  const title = zh ? titleZh : titleEn;

  const onExport = () => {
    if (filtered.length === 0) return;
    const head = "时间,订单ID,方向,数量,代币,类型,对手方\n";
    const rows = filtered
      .map((r) =>
        [
          formatDateTime(r.timestamp),
          r.txHash,
          r.direction === "in" ? "转入" : "转出",
          formatAmount(r.amount, r.token),
          r.token,
          r.orderType,
          r.counterparty,
        ].join(","),
      )
      .join("\n");
    const blob = new Blob(["\uFEFF" + head + rows], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${tokenType}_history_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

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
              {loading ? (loadingMsg || (zh ? "查询中…" : "Loading…")) : zh ? "查询" : "Query"}
            </button>
          </div>
        </div>
      </div>

      {/* Summary + Filters */}
      {records.length > 0 && (
        <div className="history-summary-bar">
          <div className="history-summary-stats">
            <span className="hs-item">
              <span className="hs-label">{zh ? "收入" : "In"}</span>
              <span className="hs-val hi-pos">+{formatAmount(summary.totalIn, tokenType)}</span>
            </span>
            <span className="hs-item">
              <span className="hs-label">{zh ? "支出" : "Out"}</span>
              <span className="hs-val hi-neg">−{formatAmount(summary.totalOut, tokenType)}</span>
            </span>
            <span className="hs-item">
              <span className="hs-label">{zh ? "笔数" : "Txns"}</span>
              <span className="hs-val">{summary.count}</span>
            </span>
          </div>
          {/* Type filter chips */}
          {orderTypes.length > 1 && (
            <div className="history-chips">
              <button
                type="button"
                className={`history-chip ${filterType === "" ? "active" : ""}`}
                onClick={() => { setFilterType(""); setPage(1); }}
              >
                {zh ? "全部" : "All"}
              </button>
              {orderTypes.map((t) => (
                <button
                  key={t}
                  type="button"
                  className={`history-chip ${filterType === t ? "active" : ""}`}
                  style={filterType === t ? { borderColor: TYPE_COLORS[t] || "#4facfe" } : undefined}
                  onClick={() => { setFilterType(t); setPage(1); }}
                >
                  {t}
                </button>
              ))}
            </div>
          )}
          <button className="history-export-btn" type="button" onClick={onExport}>
            {zh ? "导出 CSV" : "Export CSV"}
          </button>
        </div>
      )}

      {/* List */}
      <div className="history-list">
        {loading && <p className="history-msg">{loadingMsg || (zh ? "查询中…" : "Loading…")}</p>}
        {!loading && err && <p className="history-msg history-err">{err}</p>}
        {!loading && !err && records.length === 0 && (
          <p className="history-msg">{zh ? "暂无记录" : "No records found."}</p>
        )}

        {shown.map((r, i) => (
          <div key={`${r.txHash}-${i}`} className="history-item">
            <div className="hi-row">
              <span className="hi-label">{zh ? "订单ID：" : "TxHash:"}</span>
              <a
                className="hi-hash"
                href={`${CNC_MAINNET_BLOCK_EXPLORER_URL}/tx/${r.txHash}`}
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
              <span
                className="hi-type-badge"
                style={{ borderColor: TYPE_COLORS[r.orderType] || "#666", color: TYPE_COLORS[r.orderType] || "inherit" }}
              >
                {r.orderType}
              </span>
            </div>
            <div className="hi-row">
              <span className="hi-label">{zh ? "对手方：" : "Addr:"}</span>
              <a
                className="hi-hash"
                href={`${CNC_MAINNET_BLOCK_EXPLORER_URL}/address/${r.counterparty}`}
                target="_blank"
                rel="noreferrer"
              >
                {r.counterparty.slice(0, 8)}…{r.counterparty.slice(-6)}
              </a>
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
