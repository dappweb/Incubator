import { BrowserProvider } from "ethers";
import { useCallback, useEffect, useState } from "react";
import { currentDayId, fetchLeaderboardDay, type FomoEntry, type LeaderboardDay, type TopEntry } from "../lib/leaderboard";
import { formatUsdt } from "../lib/usdtContract";

interface Props {
  provider: BrowserProvider;
  onBack?: () => void;
  lang: "zh" | "en";
}

type LeaderTab = "today" | "yesterday";

function formatLeaderboardError(error: unknown, zh: boolean): string {
  const fallback = zh ? "加载失败，请稍后重试。" : "Load failed. Please try again.";
  if (!(error instanceof Error)) return fallback;

  const msg = error.message.toLowerCase();
  if (msg.includes("limit exceeded") || msg.includes("-32005") || msg.includes("too many results")) {
    return zh ? "链上节点繁忙，正在自动重试。" : "RPC is busy. Auto-retrying with smaller ranges.";
  }
  if (msg.includes("timeout") || msg.includes("network") || msg.includes("failed to fetch")) {
    return zh ? "网络波动，请稍后刷新。" : "Network is unstable. Please refresh shortly.";
  }
  return fallback;
}

function maskAddr(addr: string): string {
  if (!addr || addr.length < 10) return addr;
  return addr.slice(0, 6) + "***" + addr.slice(-4);
}

function fmtTime(ts: number, lang: "zh" | "en"): string {
  if (!ts) return "—";
  const d = new Date(ts * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  const date = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  const time = `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  return lang === "zh" ? `${date} ${time}` : `${date} ${time}`;
}

function fmtUsdt(v: bigint | null): string {
  if (v === null) return "—";
  return formatUsdt(v);
}

interface TableProps {
  title: string;
  headers: string[];
  rows: (string | null)[][];
  loading: boolean;
  lang: "zh" | "en";
}

function RankTable({ title, headers, rows, loading, lang }: TableProps) {
  const zh = lang === "zh";
  return (
    <div className="lb-table-wrap">
      <p className="lb-table-title">{title}</p>
      <table className="lb-table">
        <thead>
          <tr>
            {headers.map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={headers.length} className="lb-cell-center">
                {zh ? "加载中…" : "Loading…"}
              </td>
            </tr>
          ) : rows.length === 0 ? (
            <tr>
              <td colSpan={headers.length} className="lb-cell-center">
                {zh ? "暂无数据" : "No data"}
              </td>
            </tr>
          ) : (
            rows.map((row, i) => (
              <tr key={i} className={i % 2 === 0 ? "lb-row-even" : ""}>
                {row.map((cell, j) => (
                  <td key={j}>{cell ?? "—"}</td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function buildTop10Rows(entries: TopEntry[], showReward: boolean, lang: "zh" | "en") {
  return entries.map((e) => [
    String(e.rank),
    maskAddr(e.address),
    `${fmtUsdt(e.totalVolume)} USDT`,
    ...(showReward ? [`${fmtUsdt(e.rewardAmount)} USDT`] : []),
    fmtTime(e.timestamp, lang),
  ]);
}

function buildFomoRows(entries: FomoEntry[], showReward: boolean, lang: "zh" | "en") {
  return entries.map((e) => [
    String(e.rank),
    maskAddr(e.address),
    `${fmtUsdt(e.purchaseAmount)} USDT`,
    ...(showReward ? [`${fmtUsdt(e.rewardAmount)} USDT`] : []),
    fmtTime(e.timestamp, lang),
  ]);
}

export function Leaderboard({ provider, onBack, lang }: Props) {
  const zh = lang === "zh";
  const inline = !onBack;
  const [tab, setTab] = useState<LeaderTab>("today");
  const [todayData, setTodayData] = useState<LeaderboardDay | null>(null);
  const [yesterdayData, setYesterdayData] = useState<LeaderboardDay | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(
    async (targetTab: LeaderTab) => {
      setLoading(true);
      setErr("");
      const dayId = currentDayId();
      try {
        if (targetTab === "today" && !todayData) {
          const data = await fetchLeaderboardDay(provider, dayId);
          setTodayData(data);
        } else if (targetTab === "yesterday" && !yesterdayData) {
          const data = await fetchLeaderboardDay(provider, dayId - 1);
          setYesterdayData(data);
        }
      } catch (e: unknown) {
        setErr(formatLeaderboardError(e, zh));
      } finally {
        setLoading(false);
      }
    },
    [provider, todayData, yesterdayData, zh],
  );

  const handleTab = (t: LeaderTab) => {
    setTab(t);
    void load(t);
  };

  // Load today on mount once
  useEffect(() => {
    void load("today");
  }, [load]);

  const activeData = tab === "today" ? todayData : yesterdayData;
  const isYesterday = tab === "yesterday";

  const top10Headers = isYesterday
    ? [zh ? "名次" : "#", zh ? "地址" : "Address", zh ? "入金总额" : "Volume", zh ? "奖励" : "Reward", zh ? "时间" : "Time"]
    : [zh ? "名次" : "#", zh ? "地址" : "Address", zh ? "入金总额" : "Volume", zh ? "时间" : "Time"];

  const fomoHeaders = isYesterday
    ? [zh ? "名次" : "#", zh ? "地址" : "Address", zh ? "入金" : "Amount", zh ? "奖励" : "Reward", zh ? "时间" : "Time"]
    : [zh ? "名次" : "#", zh ? "地址" : "Address", zh ? "入金" : "Amount", zh ? "时间" : "Time"];

  const top10Title = isYesterday
    ? (zh ? "1.5% 奖励金额昨日排名" : "1.5% Top Rewards (Yesterday)")
    : (zh ? "1.5% 奖励当日入金额排名" : "1.5% Top Depositors (Today)");

  const fomoTitle = isYesterday
    ? (zh ? "0.5% fomo 奖励昨日排名" : "0.5% FOMO Rewards (Yesterday)")
    : (zh ? "0.5% 当日奖励实时排名" : "0.5% FOMO Real-time (Today)");

  const top10Rows = activeData
    ? buildTop10Rows(activeData.top10, isYesterday, lang)
    : [];
  const fomoRows = activeData
    ? buildFomoRows(activeData.last10, isYesterday, lang)
    : [];

  return (
    <div className={inline ? "lb-page lb-inline" : "lb-page"}>
      {/* Header */}
      <div className="lb-header">
        <div className="lb-header-top">
          {onBack && (
            <button className="lb-back-btn" type="button" onClick={onBack}>
              ‹ {zh ? "返回" : "Back"}
            </button>
          )}
          <div className={inline ? "lb-tabs lb-tabs-full" : "lb-tabs"}>
            <button
              className={`lb-tab ${tab === "today" ? "lb-tab-active" : ""}`}
              type="button"
              onClick={() => handleTab("today")}
            >
              {zh ? "🏆 今日排名" : "🏆 Today"}
            </button>
            <button
              className={`lb-tab ${tab === "yesterday" ? "lb-tab-active" : ""}`}
              type="button"
              onClick={() => handleTab("yesterday")}
            >
              {zh ? "💰 昨日奖励" : "💰 Yesterday"}
            </button>
          </div>
        </div>
        {inline && (
          <p className="lb-header-subtitle">
            {zh
              ? "奖池 2%：日榜 1.5% + FOMO 0.5%　|　今日为实时排名"
              : "Pool 2%: Daily 1.5% + FOMO 0.5% | Today is real-time"}
          </p>
        )}
      </div>

      {/* Content */}
      <div className="lb-body">
        {!inline && (
          <div className="lb-explain" role="note">
            <p className="lb-explain-title">{zh ? "排行榜说明" : "How Rankings Work"}</p>
            <ul className="lb-explain-list">
              {(zh
                ? [
                    "今日排名为实时数据，名次会随入金动态变化。",
                    "昨日奖励发放为昨日最终结算结果。",
                    "排行榜奖池共 2%，其中日榜 1.5%，FOMO 榜 0.5%。",
                  ]
                : [
                    "Today rankings are real-time and can change as new deposits arrive.",
                    "Yesterday rewards show the finalized settlement for the previous day.",
                    "Leaderboard pool is 2% in total: 1.5% daily ranking + 0.5% FOMO ranking.",
                  ]
              ).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        )}

        {err && <p className="lb-err">{err}</p>}
        <RankTable
          title={top10Title}
          headers={top10Headers}
          rows={top10Rows}
          loading={loading && !activeData}
          lang={lang}
        />
        <RankTable
          title={fomoTitle}
          headers={fomoHeaders}
          rows={fomoRows}
          loading={loading && !activeData}
          lang={lang}
        />

        {!inline && (
          <div className="lb-note" role="note">
            <p className="lb-note-title">{zh ? "字段说明" : "Field Notes"}</p>
            <ul className="lb-note-list">
              {(zh
                ? [
                    "入金总额/入金：参与排名的有效金额。",
                    "奖励数量：仅在昨日页显示，表示实际发放金额。",
                    "时间：链上记录时间。",
                  ]
                : [
                    "Volume/Amount: effective amount counted for ranking.",
                    "Reward: shown on yesterday tab only, indicating actual distributed amount.",
                    "Time: on-chain recorded timestamp.",
                  ]
              ).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        )}

        <button
          className="lb-refresh-btn"
          type="button"
          disabled={loading}
          onClick={() => {
            if (tab === "today") setTodayData(null);
            else setYesterdayData(null);
            void load(tab);
          }}
        >
          {loading ? (zh ? "加载中…" : "Loading…") : (zh ? "🔄 刷新" : "🔄 Refresh")}
        </button>
      </div>
    </div>
  );
}
