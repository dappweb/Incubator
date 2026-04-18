import { BrowserProvider, formatUnits } from "ethers";
import React, { useCallback, useEffect, useState } from "react";
import {
  bootstrapRoleLists,
  getSettlementSummary,
  previewNodeSettlement,
  previewSuperNodeSettlement,
  setMinPoolSettleAmount,
  setPublicSettleEnabled,
  settleLeaderboard,
  settleNodePoolOnChain,
  settleSuperNodePoolOnChain,
  type PoolPreview,
  type SettlementSummary,
} from "../lib/coreContract";
import { parseContractError } from "../lib/errorParser";

interface Props {
  provider: BrowserProvider | null;
  lang: "zh" | "en";
  actionKey: string;
  executeAction: (key: string, fn: () => Promise<void>, successMsg: string) => Promise<void>;
  usdtDecimals: number;
  loadingLabel: string;
}

const fmt = (value: bigint, decimals: number) => {
  try {
    return formatUnits(value, decimals);
  } catch {
    return value.toString();
  }
};

const short = (addr: string) => `${addr.slice(0, 6)}..${addr.slice(-4)}`;

const AdminSettlementPanel: React.FC<Props> = ({
  provider,
  lang,
  actionKey,
  executeAction,
  usdtDecimals,
  loadingLabel,
}) => {
  const [summary, setSummary] = useState<SettlementSummary | null>(null);
  const [nodePreview, setNodePreview] = useState<PoolPreview | null>(null);
  const [superPreview, setSuperPreview] = useState<PoolPreview | null>(null);
  const [loadError, setLoadError] = useState<string>("");
  const [refreshTick, setRefreshTick] = useState(0);
  const [leaderboardDayInput, setLeaderboardDayInput] = useState<string>("");

  const refresh = useCallback(async () => {
    if (!provider) return;
    try {
      const s = await getSettlementSummary(provider);
      setSummary(s);
      setLoadError("");
    } catch (err) {
      setLoadError(parseContractError(err));
    }
  }, [provider]);

  useEffect(() => { void refresh(); }, [refresh, refreshTick]);

  const onPreviewNode = async () => {
    if (!provider) return;
    try {
      const p = await previewNodeSettlement(provider);
      setNodePreview(p);
      setSuperPreview(null);
    } catch (err) {
      alert(parseContractError(err));
    }
  };
  const onPreviewSuper = async () => {
    if (!provider) return;
    try {
      const p = await previewSuperNodeSettlement(provider);
      setSuperPreview(p);
      setNodePreview(null);
    } catch (err) {
      alert(parseContractError(err));
    }
  };

  const bumpRefresh = () => setRefreshTick((x) => x + 1);

  const zh = lang === "zh";

  if (!provider) {
    return (
      <div style={{ marginTop: "16px", padding: "10px", border: "1px solid #555", borderRadius: "6px" }}>
        {zh ? "请先连接钱包。" : "Please connect wallet first."}
      </div>
    );
  }

  const card = (title: string, children: React.ReactNode) => (
    <div style={{
      flex: 1,
      minWidth: "260px",
      padding: "10px",
      border: "1px solid #2d7",
      borderRadius: "6px",
      background: "rgba(45,119,119,0.04)",
    }}>
      <div style={{ fontWeight: 600, color: "#2d7", marginBottom: "8px" }}>{title}</div>
      {children}
    </div>
  );

  const stat = (label: string, value: string | number) => (
    <div style={{ fontSize: "12px", color: "#888", marginBottom: "4px" }}>
      {label}: <span style={{ color: "#ddd", fontWeight: 500 }}>{String(value)}</span>
    </div>
  );

  const today = summary?.currentDay ?? 0n;
  const nodeSettledToday = summary ? summary.lastNodePoolSettleDay >= today : false;
  const superSettledToday = summary ? summary.lastSuperNodePoolSettleDay >= today : false;

  return (
    <div style={{ marginTop: "16px", padding: "10px", border: "1px solid #2d7", borderRadius: "6px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
        <div style={{ fontWeight: 600, color: "#2d7" }}>
          {zh ? "三池链上自动结算（推荐）" : "On-chain Auto-Settlement (recommended)"}
        </div>
        <button className="ghost-btn" type="button" onClick={bumpRefresh} disabled={actionKey !== ""}>
          {zh ? "刷新" : "Refresh"}
        </button>
      </div>

      <div style={{ fontSize: "12px", color: "#888", marginBottom: "10px" }}>
        {zh
          ? "合约按 (directReferralVolume + teamTotalVolume) 权重在链上自动分配池内 USDT；每天幂等。"
          : "Contract auto-distributes each pool by (directReferralVolume + teamTotalVolume) weights; idempotent per-day."}
      </div>

      {loadError && (
        <div style={{ color: "#f55", fontSize: "12px", marginBottom: "8px" }}>{loadError}</div>
      )}

      {summary && (
        <>
          <div style={{ fontSize: "12px", color: "#aaa", marginBottom: "10px" }}>
            {stat("currentDay", summary.currentDay.toString())}
            {stat(zh ? "节点列表" : "Node list", `${summary.nodeList.length}`)}
            {stat(zh ? "超节列表" : "SuperNode list", `${summary.superNodeList.length}`)}
            {stat("publicSettleEnabled", String(summary.publicSettleEnabled))}
            {stat("minPoolSettleAmount", `${fmt(summary.minPoolSettleAmount, usdtDecimals)} USDT`)}
            {stat("roleListsBootstrapped", String(summary.roleListsBootstrapped))}
          </div>

          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            {card(zh ? "节点池 8%" : "Node Pool 8%", (
              <>
                {stat(zh ? "余额" : "balance", `${fmt(summary.nodePoolBalance, usdtDecimals)} USDT`)}
                {stat("lastSettleDay", summary.lastNodePoolSettleDay.toString())}
                {stat(zh ? "今日是否已结算" : "settled today", String(nodeSettledToday))}
                <div className="actions admin-actions-tight" style={{ marginTop: "6px" }}>
                  <button className="ghost-btn" type="button" onClick={onPreviewNode} disabled={actionKey !== ""}>
                    {zh ? "预览" : "Preview"}
                  </button>
                  <button
                    className="primary-btn"
                    type="button"
                    disabled={actionKey !== "" || nodeSettledToday || summary.nodePoolBalance < summary.minPoolSettleAmount}
                    onClick={() => void executeAction("settle-node-onchain", async () => {
                      await settleNodePoolOnChain(provider);
                      bumpRefresh();
                    }, zh ? "节点池结算完成。" : "Node pool settled.")}
                  >
                    {actionKey === "settle-node-onchain" ? loadingLabel : zh ? "结算节点池" : "Settle Node"}
                  </button>
                </div>
              </>
            ))}

            {card(zh ? "超节池 5%" : "SuperNode Pool 5%", (
              <>
                {stat(zh ? "余额" : "balance", `${fmt(summary.superNodePoolBalance, usdtDecimals)} USDT`)}
                {stat("lastSettleDay", summary.lastSuperNodePoolSettleDay.toString())}
                {stat(zh ? "今日是否已结算" : "settled today", String(superSettledToday))}
                <div className="actions admin-actions-tight" style={{ marginTop: "6px" }}>
                  <button className="ghost-btn" type="button" onClick={onPreviewSuper} disabled={actionKey !== ""}>
                    {zh ? "预览" : "Preview"}
                  </button>
                  <button
                    className="primary-btn"
                    type="button"
                    disabled={actionKey !== "" || superSettledToday || summary.superNodePoolBalance < summary.minPoolSettleAmount}
                    onClick={() => void executeAction("settle-super-onchain", async () => {
                      await settleSuperNodePoolOnChain(provider);
                      bumpRefresh();
                    }, zh ? "超节池结算完成。" : "SuperNode pool settled.")}
                  >
                    {actionKey === "settle-super-onchain" ? loadingLabel : zh ? "结算超节池" : "Settle Super"}
                  </button>
                </div>
              </>
            ))}

            {card(zh ? "排行榜池 2%" : "Leaderboard Pool 2%", (
              <>
                {stat(zh ? "余额" : "balance", `${fmt(summary.leaderboardPoolBalance, usdtDecimals)} USDT`)}
                {stat("yesterdayId", summary.leaderboardYesterdayId.toString())}
                {stat(zh ? "昨日是否已结算" : "yesterday settled", String(summary.leaderboardSettledYesterday))}
                <label className="field" style={{ marginTop: "6px" }}>
                  {zh ? "dayId(默认昨日)" : "dayId (default yesterday)"}
                  <input
                    value={leaderboardDayInput}
                    onChange={(e) => setLeaderboardDayInput(e.target.value)}
                    placeholder={summary.leaderboardYesterdayId.toString()}
                  />
                </label>
                <div className="actions admin-actions-tight" style={{ marginTop: "6px" }}>
                  <button
                    className="primary-btn"
                    type="button"
                    disabled={actionKey !== ""}
                    onClick={() => void executeAction("settle-leader-onchain", async () => {
                      const dayId = leaderboardDayInput
                        ? BigInt(leaderboardDayInput)
                        : summary.leaderboardYesterdayId;
                      await settleLeaderboard(provider, dayId);
                      bumpRefresh();
                    }, zh ? "排行榜结算完成。" : "Leaderboard settled.")}
                  >
                    {actionKey === "settle-leader-onchain" ? loadingLabel : zh ? "结算排行榜" : "Settle Leaderboard"}
                  </button>
                </div>
              </>
            ))}
          </div>

          {(nodePreview || superPreview) && (
            <div style={{ marginTop: "10px", padding: "8px", background: "rgba(0,0,0,0.2)", borderRadius: "4px" }}>
              <div style={{ fontSize: "12px", fontWeight: 600, marginBottom: "4px" }}>
                {zh ? "分配预览" : "Distribution Preview"}
              </div>
              {(() => {
                const p = nodePreview ?? superPreview!;
                return (
                  <>
                    <div style={{ fontSize: "12px", color: "#aaa" }}>
                      total={fmt(p.total, usdtDecimals)} USDT · totalWeight={p.totalWeight.toString()} · entries={p.entries.length}
                    </div>
                    <div style={{ maxHeight: "180px", overflow: "auto", fontFamily: "monospace", fontSize: "11px", marginTop: "4px" }}>
                      {p.entries.slice(0, 50).map((e) => (
                        <div key={e.recipient}>
                          {short(e.recipient)} · bps={e.bps} · {fmt(e.amount, usdtDecimals)} USDT · w={e.weight.toString()}
                        </div>
                      ))}
                      {p.entries.length > 50 && <div>... (+{p.entries.length - 50})</div>}
                    </div>
                  </>
                );
              })()}
            </div>
          )}

          <div style={{ marginTop: "12px", paddingTop: "8px", borderTop: "1px solid #333" }}>
            <div style={{ fontSize: "12px", fontWeight: 600, marginBottom: "6px" }}>
              {zh ? "结算参数与一次性初始化" : "Settlement Config & One-time Setup"}
            </div>
            <div className="actions admin-actions-tight">
              <button
                className="ghost-btn"
                type="button"
                disabled={actionKey !== "" || summary.roleListsBootstrapped}
                onClick={() => void executeAction("bootstrap-role-lists", async () => {
                  await bootstrapRoleLists(provider);
                  bumpRefresh();
                }, zh ? "角色列表已初始化。" : "Role lists bootstrapped.")}
              >
                {actionKey === "bootstrap-role-lists"
                  ? loadingLabel
                  : summary.roleListsBootstrapped
                    ? zh ? "✓ 已初始化" : "✓ Bootstrapped"
                    : zh ? "初始化角色列表" : "Bootstrap Role Lists"}
              </button>
              <button
                className="ghost-btn"
                type="button"
                disabled={actionKey !== ""}
                onClick={() => void executeAction("toggle-public-settle", async () => {
                  await setPublicSettleEnabled(provider, !summary.publicSettleEnabled);
                  bumpRefresh();
                }, zh ? "已切换开关。" : "Toggled.")}
              >
                {actionKey === "toggle-public-settle"
                  ? loadingLabel
                  : summary.publicSettleEnabled
                    ? zh ? "关闭公开结算" : "Disable Public Settle"
                    : zh ? "开启公开结算" : "Enable Public Settle"}
              </button>
              <button
                className="ghost-btn"
                type="button"
                disabled={actionKey !== ""}
                onClick={() => void executeAction("set-min-settle", async () => {
                  const raw = prompt(zh ? "最低结算金额 (USDT)" : "Min settle amount (USDT)", "1");
                  if (raw === null) throw new Error("cancelled");
                  const n = Number(raw);
                  if (!Number.isFinite(n) || n < 0) throw new Error("invalid number");
                  const scale = BigInt(10) ** BigInt(usdtDecimals);
                  const value = BigInt(Math.floor(n * 1e6)) * scale / 1_000_000n;
                  await setMinPoolSettleAmount(provider, value);
                  bumpRefresh();
                }, zh ? "已更新最低结算金额。" : "Updated min settle amount.")}
              >
                {actionKey === "set-min-settle" ? loadingLabel : zh ? "设置最低结算金额" : "Set Min Settle Amount"}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default AdminSettlementPanel;
