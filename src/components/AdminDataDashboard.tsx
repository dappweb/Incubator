import { BrowserProvider } from "ethers";
import React, { useEffect, useRef, useState } from "react";
import {
  getDashboardSummary,
  getLeaderboardData,
  getPoolSummary,
  getSystemHealthStatus,
  getTokenSupplySummary,
} from "../lib/coreContract";
import { USDT_DECIMALS } from "../lib/usdtContract";
import { Card, KVRow } from "./Common";

interface DashboardSummary {
  nodeCount: number;
  superNodeCount: number;
  currentDay: number;
  leaderboardParticipants: number;
  maxVolume: bigint;
  totalVolume: bigint;
}

interface PoolInfo {
  type: number;
  name: string;
  bps: number;
  recipient: string;
  accumulated: bigint;
}

interface PoolSummary {
  pools: PoolInfo[];
  totalAccumulated: bigint;
}

interface TokenSupplySummary {
  usdtSupply: bigint;
  icoSupply: bigint;
  lightSupply: bigint;
  usdtCoreBalance: bigint;
  icoCoreBalance: bigint;
  lightCoreBalance: bigint;
  rewardPoolBalance: bigint;
}

interface LeaderboardData {
  topUsers: string[];
  topVolumes: bigint[];
  topCount: number;
  lastUsers: string[];
  lastCount: number;
}

interface SystemHealthStatus {
  corePaused: boolean;
  swapPaused: boolean;
  cycleDuration: bigint;
  currentDay: number;
  rewardPoolBalance: bigint;
}

interface AdminDataDashboardProps {
  lang: "zh" | "en";
  provider: BrowserProvider | null;
}

interface DashboardData {
  summary: DashboardSummary | null;
  pools: PoolSummary | null;
  tokens: TokenSupplySummary | null;
  leaderboard: LeaderboardData | null;
  health: SystemHealthStatus | null;
  error: string | null;
}

const formatBigInt = (value: bigint, decimals: number = 18, fractionDigits: number = 2): string => {
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const base = 10n ** BigInt(decimals);
  const integerPart = abs / base;
  const fractionPart = abs % base;

  const fractionScale = 10n ** BigInt(fractionDigits);
  const fractionDisplay = decimals > 0
    ? ((fractionPart * fractionScale) / base).toString().padStart(fractionDigits, "0")
    : "0".repeat(fractionDigits);

  const groupedInt = integerPart.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${negative ? "-" : ""}${groupedInt}.${fractionDisplay}`;
};

const formatUSDT = (value: bigint): string => formatBigInt(value, USDT_DECIMALS);
const formatLIGHT = (value: bigint): string => formatBigInt(value, 18);

const shortenAddress = (addr: string): string => {
  if (addr.length < 10) return addr;
  return addr.substring(0, 6) + "..." + addr.substring(addr.length - 4);
};

export const AdminDataDashboard: React.FC<AdminDataDashboardProps> = ({
  lang,
  provider,
}) => {
  const [data, setData] = useState<DashboardData>({
    summary: null,
    pools: null,
    tokens: null,
    leaderboard: null,
    health: null,
    error: null,
  });
  const [loading, setLoading] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<string>("");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const loadDashboardData = async () => {
    if (!provider) {
      setData((prev) => ({
        ...prev,
        error: lang === "zh" ? "Provider 未连接" : "Provider not connected",
      }));
      return;
    }

    setLoading(true);
    try {
      const [summary, pools, tokens, leaderboard, health] = await Promise.all([
        getDashboardSummary(provider),
        getPoolSummary(provider),
        getTokenSupplySummary(provider),
        getLeaderboardData(provider).catch(() => null),
        getSystemHealthStatus(provider).catch(() => null),
      ]);

      setData({
        summary,
        pools,
        tokens,
        leaderboard,
        health,
        error: null,
      });

      const now = new Date();
      setLastRefresh(
        `${now.getHours().toString().padStart(2, "0")}:${now
          .getMinutes()
          .toString()
          .padStart(2, "0")}:${now.getSeconds().toString().padStart(2, "0")}`
      );
    } catch (e) {
      console.error("Failed to load dashboard data:", e);
      setData((prev) => ({
        ...prev,
        error: lang === "zh" ? "数据加载失败" : "Failed to load data",
      }));
    } finally {
      setLoading(false);
    }
  };

  // 初始加载
  useEffect(() => {
    loadDashboardData();
  }, [provider]);

  // 自动轮询
  useEffect(() => {
    if (autoRefresh && provider) {
      // 首次设置为 30 秒后刷新
      intervalRef.current = setInterval(() => {
        loadDashboardData();
      }, 30000);

      return () => {
        if (intervalRef.current) clearInterval(intervalRef.current);
      };
    }
  }, [autoRefresh, provider]);

  return (
    <section className="grid grid-full">
      {/* ─ 刷新控制 ─ */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "20px",
          padding: "0 4px",
        }}
      >
        <div>
          <strong>{lang === "zh" ? "📊 数据监控面板" : "📊 Data Dashboard"}</strong>
          {lastRefresh && (
            <span style={{ marginLeft: "12px", color: "#666", fontSize: "12px" }}>
              {lang === "zh" ? "最后更新: " : "Last updated: "}
              {lastRefresh}
              {autoRefresh && (
                <span style={{ marginLeft: "8px", color: "#0a7" }}>
                  ({lang === "zh" ? "自动轮询中" : "auto-polling"})
                </span>
              )}
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <button
            className={autoRefresh ? "primary-btn" : "ghost-btn"}
            onClick={() => setAutoRefresh(!autoRefresh)}
            style={{ padding: "6px 12px", fontSize: "13px" }}
          >
            {autoRefresh ? "⏸️" : "▶️"}
          </button>
          <button
            className="primary-btn"
            onClick={() => loadDashboardData()}
            disabled={loading}
            style={{ padding: "6px 16px", fontSize: "14px" }}
          >
            {loading
              ? lang === "zh"
                ? "加载中..."
                : "Loading..."
              : `${lang === "zh" ? "🔄 刷新" : "🔄 Refresh"}`}
          </button>
        </div>
      </div>

      {/* ─ 错误提示 ─ */}
      {data.error && (
        <div
          style={{
            padding: "12px",
            backgroundColor: "#fee",
            border: "1px solid #fcc",
            borderRadius: "4px",
            color: "#c33",
            marginBottom: "20px",
          }}
        >
          ⚠️ {data.error}
        </div>
      )}

      {/* ─ 概览卡片 ─ */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          gap: "12px",
          marginBottom: "20px",
        }}
      >
        {data.summary && (
          <>
            <Card title={lang === "zh" ? "节点总数" : "Total Nodes"}>
              <div style={{ fontSize: "24px", fontWeight: "bold" }}>
                {data.summary.nodeCount}
              </div>
            </Card>
            <Card title={lang === "zh" ? "超级节点数" : "Super Nodes"}>
              <div style={{ fontSize: "24px", fontWeight: "bold" }}>
                {data.summary.superNodeCount}
              </div>
            </Card>
            <Card title={lang === "zh" ? "当前日期ID" : "Current Day ID"}>
              <div style={{ fontSize: "24px", fontWeight: "bold" }}>
                {data.summary.currentDay}
              </div>
            </Card>
            <Card title={lang === "zh" ? "排行榜参与人数" : "Leaderboard Members"}>
              <div style={{ fontSize: "24px", fontWeight: "bold" }}>
                {data.summary.leaderboardParticipants}
              </div>
            </Card>
            {data.summary.totalVolume > 0n && (
              <>
                <Card title={lang === "zh" ? "最高业绩" : "Max Volume"}>
                  <div style={{ fontSize: "18px", fontWeight: "bold" }}>
                    {formatUSDT(data.summary.maxVolume)} USDT
                  </div>
                </Card>
                <Card title={lang === "zh" ? "累计业绩" : "Total Volume"}>
                  <div style={{ fontSize: "18px", fontWeight: "bold" }}>
                    {formatUSDT(data.summary.totalVolume)} USDT
                  </div>
                </Card>
              </>
            )}
          </>
        )}
      </div>

      {/* ─ 资金池状态 ─ */}
      {data.pools && (
        <Card
          title={lang === "zh" ? "资金池状态" : "Pool Status"}
          className="grid-full"
        >
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #ddd" }}>
                <th
                  style={{
                    textAlign: "left",
                    padding: "8px",
                    fontWeight: "bold",
                  }}
                >
                  {lang === "zh" ? "池子名称" : "Pool Name"}
                </th>
                <th
                  style={{
                    textAlign: "right",
                    padding: "8px",
                    fontWeight: "bold",
                  }}
                >
                  {lang === "zh" ? "分配比例" : "Allocation %"}
                </th>
                <th
                  style={{
                    textAlign: "right",
                    padding: "8px",
                    fontWeight: "bold",
                  }}
                >
                  {lang === "zh" ? "累计余额" : "Accumulated"}
                </th>
              </tr>
            </thead>
            <tbody>
              {data.pools.pools.map((pool, idx) => (
                <tr
                  key={idx}
                  style={{
                    borderBottom: "1px solid #eee",
                     backgroundColor: idx % 2 === 0 ? "#fafafa" : "#f5f5f5",
                     color: "#333",
                  }}
                >
                   <td style={{ padding: "8px", color: "#333" }}>{pool.name}</td>
                   <td style={{ textAlign: "right", padding: "8px", color: "#333" }}>
                    {(pool.bps / 100).toFixed(2)}%
                  </td>
                   <td style={{ textAlign: "right", padding: "8px", color: "#333" }}>
                    {formatUSDT(pool.accumulated)} USDT
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div
            style={{
              marginTop: "12px",
              paddingTop: "12px",
              borderTop: "2px solid #ddd",
              textAlign: "right",
              fontWeight: "bold",
            }}
          >
            {lang === "zh" ? "总计: " : "Total: "}
            {formatUSDT(data.pools.totalAccumulated)} USDT
          </div>
        </Card>
      )}

      {/* ─ 代币流通情况 ─ */}
      {data.tokens && (
        <Card
          title={lang === "zh" ? "代币流通情况" : "Token Supply"}
          className="grid-full"
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              gap: "16px",
            }}
          >
            <div>
              <div style={{ fontSize: "12px", color: "#666" }}>USDT</div>
              <div style={{ fontSize: "16px", fontWeight: "bold" }}>
                {formatUSDT(data.tokens.usdtSupply)}
              </div>
              <div style={{ fontSize: "12px", color: "#999", marginTop: "4px" }}>
                {lang === "zh" ? "Core: " : "Core: "}
                {formatUSDT(data.tokens.usdtCoreBalance)}
              </div>
            </div>
            <div>
              <div style={{ fontSize: "12px", color: "#666" }}>ICO</div>
              <div style={{ fontSize: "16px", fontWeight: "bold" }}>
                {formatUSDT(data.tokens.icoSupply)}
              </div>
              <div style={{ fontSize: "12px", color: "#999", marginTop: "4px" }}>
                {lang === "zh" ? "Core: " : "Core: "}
                {formatUSDT(data.tokens.icoCoreBalance)}
              </div>
            </div>
            <div>
              <div style={{ fontSize: "12px", color: "#666" }}>LIGHT</div>
              <div style={{ fontSize: "16px", fontWeight: "bold" }}>
                {formatLIGHT(data.tokens.lightSupply)}
              </div>
              <div style={{ fontSize: "12px", color: "#999", marginTop: "4px" }}>
                {lang === "zh" ? "奖励池: " : "Reward: "}
                {formatLIGHT(data.tokens.rewardPoolBalance)}
              </div>
            </div>
          </div>

          {/* 警告 */}
          {data.tokens.rewardPoolBalance === 0n && (
            <div
              style={{
                marginTop: "16px",
                padding: "12px",
                backgroundColor: "#fff3cd",
                border: "1px solid #ffc107",
                borderRadius: "4px",
                color: "#856404",
                fontSize: "14px",
              }}
            >
              ⚠️{" "}
              {lang === "zh"
                ? "LIGHT 奖励池余额为 0，需要及时补充"
                : "LIGHT reward pool is empty, please refund"}
            </div>
          )}
        </Card>
      )}

      {/* ─ 排行榜数据 ─ */}
      {data.leaderboard && data.leaderboard.topCount > 0 && (
        <Card
          title={lang === "zh" ? "排行榜 (前十)" : "Leaderboard (Top 10)"}
          className="grid-full"
        >
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #ddd" }}>
                <th
                  style={{
                    textAlign: "left",
                    padding: "8px",
                    fontWeight: "bold",
                  }}
                >
                  {lang === "zh" ? "排名" : "Rank"}
                </th>
                <th
                  style={{
                    textAlign: "left",
                    padding: "8px",
                    fontWeight: "bold",
                  }}
                >
                  {lang === "zh" ? "钱包地址" : "Address"}
                </th>
                <th
                  style={{
                    textAlign: "right",
                    padding: "8px",
                    fontWeight: "bold",
                  }}
                >
                  {lang === "zh" ? "业绩 (USDT)" : "Volume (USDT)"}
                </th>
              </tr>
            </thead>
            <tbody>
              {data.leaderboard.topUsers.map((user, idx) => (
                <tr
                  key={idx}
                  style={{
                    borderBottom: "1px solid #eee",
                    backgroundColor: idx % 2 === 0 ? "#fafafa" : "#f5f5f5",
                    color: "#333",
                  }}
                >
                  <td style={{ padding: "8px", fontWeight: "bold", color: "#333" }}>
                    {idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : `#${idx + 1}`}
                  </td>
                  <td style={{ padding: "8px", fontSize: "12px", color: "#333" }}>
                    {shortenAddress(user)}
                  </td>
                  <td style={{ textAlign: "right", padding: "8px", color: "#333", fontWeight: 600 }}>
                    {formatUSDT(data.leaderboard.topVolumes[idx] || 0n)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {/* ─ 系统健康检查 ─ */}
      {data.health && (
        <Card
          title={lang === "zh" ? "系统健康检查" : "System Health"}
          className="grid-full"
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: "16px",
            }}
          >
            <div>
              <div style={{ fontSize: "12px", color: "#666" }}>
                {lang === "zh" ? "Core 暂停状态" : "Core Paused"}
              </div>
              <div
                style={{
                  fontSize: "18px",
                  fontWeight: "bold",
                  color: data.health.corePaused ? "#c33" : "#0a7",
                  marginTop: "4px",
                }}
              >
                {data.health.corePaused ? "⛔ PAUSED" : "✓ RUNNING"}
              </div>
            </div>
            <div>
              <div style={{ fontSize: "12px", color: "#666" }}>
                {lang === "zh" ? "Swap 暂停状态" : "Swap Paused"}
              </div>
              <div
                style={{
                  fontSize: "18px",
                  fontWeight: "bold",
                  color: data.health.swapPaused ? "#c33" : "#0a7",
                  marginTop: "4px",
                }}
              >
                {data.health.swapPaused ? "⛔ PAUSED" : "✓ RUNNING"}
              </div>
            </div>
            <div>
              <div style={{ fontSize: "12px", color: "#666" }}>
                {lang === "zh" ? "结算周期" : "Cycle Duration"}
              </div>
              <div style={{ fontSize: "16px", fontWeight: "bold", marginTop: "4px" }}>
                {Number(data.health.cycleDuration) / 3600}{" "}
                {lang === "zh" ? "小时" : "hrs"}
              </div>
            </div>
            <div>
              <div style={{ fontSize: "12px", color: "#666" }}>
                {lang === "zh" ? "当前日期 ID" : "Current Day"}
              </div>
              <div style={{ fontSize: "16px", fontWeight: "bold", marginTop: "4px" }}>
                {data.health.currentDay}
              </div>
            </div>
          </div>

          <div
            style={{
              marginTop: "16px",
              padding: "12px",
              backgroundColor: "#f0f8ff",
              border: "1px solid #b3d9ff",
              borderRadius: "4px",
              fontSize: "13px",
              color: "#003366",
            }}
          >
            💡{" "}
            {lang === "zh"
              ? "奖励池余额: " + formatLIGHT(data.health.rewardPoolBalance) + " LIGHT"
              : "Reward pool: " + formatLIGHT(data.health.rewardPoolBalance) + " LIGHT"}
          </div>
        </Card>
      )}

      {/* ─ 系统信息 ─ */}
      <Card
        title={lang === "zh" ? "系统信息" : "System Info"}
        className="grid-full"
      >
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
          <KVRow
            label={lang === "zh" ? "数据刷新时间" : "Last Refresh"}
            value={lastRefresh || (lang === "zh" ? "未加载" : "Not loaded")}
          />
          <KVRow
            label={lang === "zh" ? "加载状态" : "Load Status"}
            value={loading ? (lang === "zh" ? "加载中..." : "Loading...") : "✓"}
          />
          <KVRow
            label={lang === "zh" ? "自动轮询" : "Auto Polling"}
            value={autoRefresh ? (lang === "zh" ? "启用 (30秒)" : "Enabled (30s)") : (lang === "zh" ? "禁用" : "Disabled")}
          />
          <KVRow
            label={lang === "zh" ? "刷新间隔" : "Refresh Interval"}
            value={lang === "zh" ? "30 秒" : "30 seconds"}
          />
        </div>
      </Card>
    </section>
  );
};

export default AdminDataDashboard;
