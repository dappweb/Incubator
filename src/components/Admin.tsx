import React, { useEffect, useMemo, useState } from "react";
import { BrowserProvider, isAddress } from "ethers";
import { Card, KVRow } from "./Common";
import {
  getContractOwner,
  getCorePoolConfig,
  getMachineUnitPrice,
  getNodePrice,
  getSuperNodePrice,
  isCorePaused,
  pauseCore,
  unpauseCore,
  updateCoreNodePrice,
  updateCorePoolRecipient,
  updateCorePoolShare,
  updateCoreSuperNodePrice,
  updateMachinePrice,
} from "../lib/coreContract";
import type { CorePoolConfig } from "../lib/coreContract";
import { getOtcFeeConfig, updateOtcFeeConfig } from "../lib/otcContract";
import {
  getLightFeeConfig,
  getSwapFeeVault,
  getSwapPool,
  isSwapPaused,
  settleLightFees,
  updateSwapLightFeeConfig,
  updateSwapPoolConfig,
  pauseSwap,
  unpauseSwap,
  type LightFeeConfig,
  type SwapPool,
} from "../lib/swapContract";
import { LIGHT_TOKEN_ADDRESS, OTC_CONTRACT_ADDRESS, SWAP_POOL_ADDRESS, CORE_CONTRACT_ADDRESS } from "../config";
import { formatUsdt, parseUsdt } from "../lib/usdtContract";
import { parseContractError } from "../lib/errorParser";

interface AdminProps {
  lang: "zh" | "en";
  address: string;
  contractOwner: string;
  provider: BrowserProvider | null;
  onRefresh: () => Promise<void>;
  onStatusChange: (message: string) => void;
}

type EditablePoolConfig = CorePoolConfig & {
  label: string;
  recipientInput: string;
  bpsInput: string;
};

type EditableSwapPool = SwapPool & {
  pairId: number;
  label: string;
  feeBpsInput: string;
  impactBpsInput: string;
};

const Admin: React.FC<AdminProps> = ({ lang, address, contractOwner, provider, onRefresh, onStatusChange }) => {
  const t = {
    adminTitle: lang === "zh" ? "管理后台" : "Admin Panel",
    adminHint: lang === "zh" ? "仅合约 Owner 可访问此页面。" : "Only contract owner can access this page.",
    ownerAddress: lang === "zh" ? "合约 Owner" : "Contract Owner",
    currentAddress: lang === "zh" ? "当前地址" : "Current Address",
    notOwner: lang === "zh" ? "权限不足，只有合约 Owner 可访问此页面。" : "Insufficient permissions. Only the contract owner can access this page.",
    userManagement: lang === "zh" ? "用户管理" : "User Management",
    contractManagement: lang === "zh" ? "合约管理" : "Contract Management",
    statisticsAnalysis: lang === "zh" ? "统计分析" : "Statistics & Analytics",
    adminSummary: lang === "zh" ? "管理总览" : "Admin Summary",
    adminChecklist: lang === "zh" ? "执行前检查" : "Pre-Action Checklist",
    checklistHint: lang === "zh" ? "先确认以下条件，再执行链上管理操作。" : "Verify these conditions before any on-chain admin action.",
    checklistNetwork: lang === "zh" ? "确认钱包地址与合约 Owner 一致，并已切换到 Sepolia。" : "Confirm the wallet matches the contract owner and is on Sepolia.",
    checklistConfig: lang === "zh" ? "确认前端环境变量中的 Core / OTC / Swap 合约地址已配置。" : "Confirm Core / OTC / Swap contract addresses are configured in the frontend environment.",
    checklistFunds: lang === "zh" ? "确认管理员钱包有足够测试 ETH 支付 Gas。" : "Confirm the admin wallet has enough test ETH for gas.",
    checklistRecords: lang === "zh" ? "执行高风险操作前，先记录当前价格、权限和订单状态。" : "Record current prices, permissions, and order state before high-risk operations.",
    loading: lang === "zh" ? "加载中..." : "Loading...",
    refresh: lang === "zh" ? "刷新后台数据" : "Refresh Admin Data",
    currentStatus: lang === "zh" ? "当前状态" : "Current Status",
    paused: lang === "zh" ? "已暂停" : "Paused",
    running: lang === "zh" ? "运行中" : "Running",
    coreAddress: lang === "zh" ? "Core 地址" : "Core Address",
    otcAddress: lang === "zh" ? "OTC 地址" : "OTC Address",
    swapAddress: lang === "zh" ? "Swap 地址" : "Swap Address",
    lightAddress: lang === "zh" ? "LIGHT 地址" : "LIGHT Address",
    coreControls: lang === "zh" ? "Core 开关" : "Core Controls",
    swapControls: lang === "zh" ? "Swap 开关" : "Swap Controls",
    pauseCore: lang === "zh" ? "暂停 Core" : "Pause Core",
    unpauseCore: lang === "zh" ? "恢复 Core" : "Unpause Core",
    pauseSwap: lang === "zh" ? "暂停 Swap" : "Pause Swap",
    unpauseSwap: lang === "zh" ? "恢复 Swap" : "Unpause Swap",
    corePrices: lang === "zh" ? "Core 价格配置" : "Core Price Config",
    saveMachinePrice: lang === "zh" ? "保存矿机价格" : "Save Machine Price",
    saveNodePrice: lang === "zh" ? "保存节点价格" : "Save Node Price",
    saveSuperPrice: lang === "zh" ? "保存超级节点价格" : "Save Super Price",
    machineUnitPrice: lang === "zh" ? "矿机单价" : "Machine Price",
    nodePrice: lang === "zh" ? "节点价格" : "Node Price",
    superNodePrice: lang === "zh" ? "超级节点价格" : "Super Node Price",
    poolConfigTitle: lang === "zh" ? "Core 资金池配置" : "Core Pool Config",
    poolConfigHint: lang === "zh" ? "可单独修改每个池子的接收地址和比例，比例总和必须保持 10000 bps。" : "Update each pool recipient and share individually. Total share must remain 10000 bps.",
    recipient: lang === "zh" ? "接收地址" : "Recipient",
    shareBps: lang === "zh" ? "比例(BPS)" : "Share (BPS)",
    saveRecipient: lang === "zh" ? "保存地址" : "Save Recipient",
    saveShare: lang === "zh" ? "保存比例" : "Save Share",
    otcConfigTitle: lang === "zh" ? "OTC 手续费配置" : "OTC Fee Config",
    otcFeeRate: lang === "zh" ? "手续费(BPS)" : "Fee (BPS)",
    otcFeeRecipient: lang === "zh" ? "手续费接收地址" : "Fee Recipient",
    saveOtcConfig: lang === "zh" ? "保存 OTC 配置" : "Save OTC Config",
    swapPoolConfigTitle: lang === "zh" ? "Swap 池配置" : "Swap Pool Config",
    swapPoolFee: lang === "zh" ? "池手续费(BPS)" : "Pool Fee (BPS)",
    swapImpactLimit: lang === "zh" ? "冲击上限(BPS)" : "Impact Limit (BPS)",
    saveSwapPool: lang === "zh" ? "保存池配置" : "Save Pool Config",
    lightConfigTitle: lang === "zh" ? "LIGHT 分账配置" : "LIGHT Fee Config",
    burnBps: lang === "zh" ? "销毁(BPS)" : "Burn (BPS)",
    bootstrapBps: lang === "zh" ? "启动池(BPS)" : "Bootstrap (BPS)",
    nodeBps: lang === "zh" ? "节点池(BPS)" : "Node Pool (BPS)",
    superNodeBps: lang === "zh" ? "超级节点池(BPS)" : "Super Node Pool (BPS)",
    bootstrapRecipient: lang === "zh" ? "启动池地址" : "Bootstrap Recipient",
    nodeRecipient: lang === "zh" ? "节点池地址" : "Node Recipient",
    superNodeRecipient: lang === "zh" ? "超级节点池地址" : "Super Node Recipient",
    saveLightConfig: lang === "zh" ? "保存 LIGHT 配置" : "Save LIGHT Config",
    settleLightFees: lang === "zh" ? "执行 LIGHT 清算" : "Settle LIGHT Fees",
    lightVaultBalance: lang === "zh" ? "待清算 LIGHT 手续费" : "Pending LIGHT Fees",
    pairPrimary: lang === "zh" ? "主池 USDT/ICO" : "Primary USDT/ICO",
    pairLight: lang === "zh" ? "回收池 LIGHT/ICO" : "Recovery LIGHT/ICO",
    invalidAddress: lang === "zh" ? "地址格式无效" : "Invalid address",
    invalidBps: lang === "zh" ? "请输入有效 BPS 数值" : "Enter a valid BPS value",
    invalidPrice: lang === "zh" ? "请输入有效 USDT 价格" : "Enter a valid USDT price",
    adminDataRefreshed: lang === "zh" ? "后台数据已刷新。" : "Admin data refreshed.",
    actionSuccess: lang === "zh" ? "操作成功。" : "Action completed.",
    adminNotReady: lang === "zh" ? "钱包或 Provider 尚未就绪。" : "Wallet or provider is not ready.",
  };

  const poolLabels = useMemo(
    () => [
      lang === "zh" ? "LP 底池" : "Liquidity",
      lang === "zh" ? "直推池" : "Referral",
      lang === "zh" ? "超级节点池" : "Super Node",
      lang === "zh" ? "节点池" : "Node",
      lang === "zh" ? "平台池" : "Platform",
      lang === "zh" ? "排行榜池" : "Leaderboard",
    ],
    [lang],
  );

  const [isLoadingState, setIsLoadingState] = useState(true);
  const [actionKey, setActionKey] = useState("");
  const [localStatus, setLocalStatus] = useState("");
  const [resolvedOwner, setResolvedOwner] = useState(contractOwner);
  const [corePaused, setCorePaused] = useState(false);
  const [swapPausedState, setSwapPausedState] = useState(false);
  const [machinePrice, setMachinePrice] = useState<bigint>(0n);
  const [nodePrice, setNodePrice] = useState<bigint>(0n);
  const [superPrice, setSuperPrice] = useState<bigint>(0n);
  const [machinePriceInput, setMachinePriceInput] = useState("");
  const [nodePriceInput, setNodePriceInput] = useState("");
  const [superPriceInput, setSuperPriceInput] = useState("");
  const [poolConfigs, setPoolConfigs] = useState<EditablePoolConfig[]>([]);
  const [otcFeeBps, setOtcFeeBps] = useState(0);
  const [otcFeeRecipient, setOtcFeeRecipient] = useState("");
  const [otcFeeBpsInput, setOtcFeeBpsInput] = useState("");
  const [otcFeeRecipientInput, setOtcFeeRecipientInput] = useState("");
  const [swapPools, setSwapPools] = useState<EditableSwapPool[]>([]);
  const [lightConfig, setLightConfig] = useState<LightFeeConfig | null>(null);
  const [lightFeeVault, setLightFeeVault] = useState<bigint>(0n);
  const [lightConfigInput, setLightConfigInput] = useState({
    burnBps: "",
    bootstrapBps: "",
    nodeBps: "",
    superNodeBps: "",
    bootstrapRecipient: "",
    nodeRecipient: "",
    superNodeRecipient: "",
  });

  const isOwner = address && contractOwner && address.toLowerCase() === contractOwner.toLowerCase();

  const loadAdminState = async () => {
    if (!provider) {
      setIsLoadingState(false);
      return;
    }

    setIsLoadingState(true);
    try {
      const [owner, nextCorePaused, nextSwapPaused, nextMachinePrice, nextNodePrice, nextSuperPrice, nextOtcConfig, nextLightConfig, nextLightVault] = await Promise.all([
        getContractOwner(provider),
        isCorePaused(provider),
        isSwapPaused(provider),
        getMachineUnitPrice(provider),
        getNodePrice(provider),
        getSuperNodePrice(provider),
        getOtcFeeConfig(provider),
        getLightFeeConfig(provider),
        LIGHT_TOKEN_ADDRESS ? getSwapFeeVault(provider, 1, LIGHT_TOKEN_ADDRESS) : Promise.resolve(0n),
      ]);

      const nextPools = await Promise.all(poolLabels.map((label, poolType) => getCorePoolConfig(provider, poolType).then((config) => ({
        label,
        recipient: config.recipient,
        bps: config.bps,
        recipientInput: config.recipient,
        bpsInput: String(config.bps),
      }))));

      const nextSwapPools = await Promise.all([
        getSwapPool(provider, 0),
        getSwapPool(provider, 1),
      ]);

      setResolvedOwner(owner);
      setCorePaused(nextCorePaused);
      setSwapPausedState(nextSwapPaused);
      setMachinePrice(nextMachinePrice);
      setNodePrice(nextNodePrice);
      setSuperPrice(nextSuperPrice);
      setMachinePriceInput(formatUsdt(nextMachinePrice));
      setNodePriceInput(formatUsdt(nextNodePrice));
      setSuperPriceInput(formatUsdt(nextSuperPrice));
      setPoolConfigs(nextPools);
      setOtcFeeBps(nextOtcConfig.feeBps);
      setOtcFeeRecipient(nextOtcConfig.feeRecipient);
      setOtcFeeBpsInput(String(nextOtcConfig.feeBps));
      setOtcFeeRecipientInput(nextOtcConfig.feeRecipient);
      setSwapPools([
        { ...nextSwapPools[0], pairId: 0, label: t.pairPrimary, feeBpsInput: String(nextSwapPools[0].feeBps), impactBpsInput: String(nextSwapPools[0].maxPriceImpactBps) },
        { ...nextSwapPools[1], pairId: 1, label: t.pairLight, feeBpsInput: String(nextSwapPools[1].feeBps), impactBpsInput: String(nextSwapPools[1].maxPriceImpactBps) },
      ]);
      setLightConfig(nextLightConfig);
      setLightFeeVault(nextLightVault);
      setLightConfigInput({
        burnBps: String(nextLightConfig.burnBps),
        bootstrapBps: String(nextLightConfig.bootstrapBps),
        nodeBps: String(nextLightConfig.nodeBps),
        superNodeBps: String(nextLightConfig.superNodeBps),
        bootstrapRecipient: nextLightConfig.bootstrapRecipient,
        nodeRecipient: nextLightConfig.nodeRecipient,
        superNodeRecipient: nextLightConfig.superNodeRecipient,
      });
    } finally {
      setIsLoadingState(false);
    }
  };

  useEffect(() => {
    void loadAdminState().catch((error) => {
      const message = parseContractError(error, lang);
      setLocalStatus(message);
      onStatusChange(message);
      setIsLoadingState(false);
    });
  }, [provider, lang]);

  const executeAction = async (key: string, action: () => Promise<void>, successMessage = t.actionSuccess) => {
    if (!provider) {
      setLocalStatus(t.adminNotReady);
      onStatusChange(t.adminNotReady);
      return;
    }

    try {
      setActionKey(key);
      setLocalStatus("");
      await action();
      await loadAdminState();
      await onRefresh();
      setLocalStatus(successMessage);
      onStatusChange(successMessage);
    } catch (error) {
      const message = parseContractError(error, lang);
      setLocalStatus(message);
      onStatusChange(message);
    } finally {
      setActionKey("");
    }
  };

  const updatePoolConfigInput = (index: number, patch: Partial<EditablePoolConfig>) => {
    setPoolConfigs((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)));
  };

  const updateSwapPoolInput = (pairId: number, patch: Partial<EditableSwapPool>) => {
    setSwapPools((current) => current.map((item) => (item.pairId === pairId ? { ...item, ...patch } : item)));
  };

  const validateAddress = (value: string) => {
    if (!isAddress(value.trim())) {
      throw new Error(t.invalidAddress);
    }
  };

  const parseBpsInput = (value: string) => {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 0) {
      throw new Error(t.invalidBps);
    }
    return parsed;
  };

  const parsePriceInput = (value: string) => {
    try {
      const parsed = parseUsdt(value);
      if (parsed <= 0n) {
        throw new Error(t.invalidPrice);
      }
      return parsed;
    } catch {
      throw new Error(t.invalidPrice);
    }
  };

  if (!isOwner) {
    return (
      <section className="grid-full">
        <Card title={t.adminTitle} hint={t.adminHint}>
          <div style={{ textAlign: "center", padding: "2rem" }}>
            <p style={{ color: "var(--color-error, #ff4444)" }}>{t.notOwner}</p>
            <KVRow label={t.currentAddress} value={address || "-"} />
            <KVRow label={t.ownerAddress} value={contractOwner || "-"} />
          </div>
        </Card>
      </section>
    );
  }

  return (
    <section className="grid">
      <Card title={t.adminSummary} hint={t.adminHint}>
        <KVRow label={t.ownerAddress} value={resolvedOwner} />
        <KVRow label={t.currentAddress} value={address} />
        <KVRow label={t.coreAddress} value={CORE_CONTRACT_ADDRESS || "-"} />
        <KVRow label={t.otcAddress} value={OTC_CONTRACT_ADDRESS || "-"} />
        <KVRow label={t.swapAddress} value={SWAP_POOL_ADDRESS || "-"} />
        <KVRow label={t.lightAddress} value={LIGHT_TOKEN_ADDRESS || "-"} />
        <KVRow label={`${t.currentStatus} Core`} value={corePaused ? t.paused : t.running} />
        <KVRow label={`${t.currentStatus} Swap`} value={swapPausedState ? t.paused : t.running} />
        <div className="actions">
          <button className="ghost-btn" type="button" onClick={() => void loadAdminState()} disabled={isLoadingState || Boolean(actionKey)}>
            {isLoadingState ? t.loading : t.refresh}
          </button>
        </div>
        {localStatus ? <p className="status">{localStatus}</p> : null}
      </Card>

      <Card title={t.adminChecklist} hint={t.checklistHint}>
        <ul className="list">
          <li className="list-item"><p>{t.checklistNetwork}</p></li>
          <li className="list-item"><p>{t.checklistConfig}</p></li>
          <li className="list-item"><p>{t.checklistFunds}</p></li>
          <li className="list-item"><p>{t.checklistRecords}</p></li>
        </ul>
      </Card>

      <Card title={t.coreControls} hint={t.contractManagement}>
        <KVRow label={t.currentStatus} value={corePaused ? t.paused : t.running} />
        <div className="actions">
          <button className="primary-btn" type="button" onClick={() => void executeAction("pause-core", () => pauseCore(provider!), lang === "zh" ? "Core 已暂停。" : "Core paused.")} disabled={corePaused || actionKey !== ""}>
            {actionKey === "pause-core" ? t.loading : t.pauseCore}
          </button>
          <button className="ghost-btn" type="button" onClick={() => void executeAction("unpause-core", () => unpauseCore(provider!), lang === "zh" ? "Core 已恢复。" : "Core unpaused.")} disabled={!corePaused || actionKey !== ""}>
            {actionKey === "unpause-core" ? t.loading : t.unpauseCore}
          </button>
        </div>
      </Card>

      <Card title={t.corePrices} hint={t.contractManagement}>
        <label className="field">
          {t.machineUnitPrice}
          <input value={machinePriceInput} onChange={(event) => setMachinePriceInput(event.target.value)} />
        </label>
        <div className="actions admin-actions-tight">
          <button className="primary-btn" type="button" onClick={() => void executeAction("machine-price", () => updateMachinePrice(provider!, parsePriceInput(machinePriceInput)), lang === "zh" ? "矿机价格已更新。" : "Machine price updated.")} disabled={actionKey !== ""}>
            {actionKey === "machine-price" ? t.loading : t.saveMachinePrice}
          </button>
          <span className="hint">{formatUsdt(machinePrice)} USDT</span>
        </div>

        <label className="field">
          {t.nodePrice}
          <input value={nodePriceInput} onChange={(event) => setNodePriceInput(event.target.value)} />
        </label>
        <div className="actions admin-actions-tight">
          <button className="primary-btn" type="button" onClick={() => void executeAction("node-price", () => updateCoreNodePrice(provider!, parsePriceInput(nodePriceInput)), lang === "zh" ? "节点价格已更新。" : "Node price updated.")} disabled={actionKey !== ""}>
            {actionKey === "node-price" ? t.loading : t.saveNodePrice}
          </button>
          <span className="hint">{formatUsdt(nodePrice)} USDT</span>
        </div>

        <label className="field">
          {t.superNodePrice}
          <input value={superPriceInput} onChange={(event) => setSuperPriceInput(event.target.value)} />
        </label>
        <div className="actions admin-actions-tight">
          <button className="primary-btn" type="button" onClick={() => void executeAction("super-price", () => updateCoreSuperNodePrice(provider!, parsePriceInput(superPriceInput)), lang === "zh" ? "超级节点价格已更新。" : "Super-node price updated.")} disabled={actionKey !== ""}>
            {actionKey === "super-price" ? t.loading : t.saveSuperPrice}
          </button>
          <span className="hint">{formatUsdt(superPrice)} USDT</span>
        </div>
      </Card>

      <Card title={t.poolConfigTitle} hint={t.poolConfigHint} className="grid-full">
        <div className="admin-pool-list">
          {poolConfigs.map((pool, index) => (
            <div key={pool.label} className="list-item">
              <div className="list-head">
                <strong>{pool.label}</strong>
                <span>{pool.bps} BPS</span>
              </div>
              <label className="field">
                {t.recipient}
                <input value={pool.recipientInput} onChange={(event) => updatePoolConfigInput(index, { recipientInput: event.target.value })} />
              </label>
              <div className="actions admin-actions-tight">
                <button className="ghost-btn" type="button" onClick={() => void executeAction(`pool-recipient-${index}`, async () => {
                  validateAddress(pool.recipientInput);
                  await updateCorePoolRecipient(provider!, index, pool.recipientInput.trim());
                }, lang === "zh" ? `${pool.label} 接收地址已更新。` : `${pool.label} recipient updated.`)} disabled={actionKey !== ""}>
                  {actionKey === `pool-recipient-${index}` ? t.loading : t.saveRecipient}
                </button>
              </div>
              <label className="field">
                {t.shareBps}
                <input value={pool.bpsInput} onChange={(event) => updatePoolConfigInput(index, { bpsInput: event.target.value })} />
              </label>
              <div className="actions admin-actions-tight">
                <button className="primary-btn" type="button" onClick={() => void executeAction(`pool-share-${index}`, async () => {
                  await updateCorePoolShare(provider!, index, parseBpsInput(pool.bpsInput));
                }, lang === "zh" ? `${pool.label} 比例已更新。` : `${pool.label} share updated.`)} disabled={actionKey !== ""}>
                  {actionKey === `pool-share-${index}` ? t.loading : t.saveShare}
                </button>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card title={t.otcConfigTitle} hint={t.contractManagement}>
        <KVRow label={t.otcFeeRate} value={`${(otcFeeBps / 100).toFixed(2)}%`} />
        <KVRow label={t.otcFeeRecipient} value={otcFeeRecipient || "-"} />
        <label className="field">
          {t.otcFeeRate}
          <input value={otcFeeBpsInput} onChange={(event) => setOtcFeeBpsInput(event.target.value)} />
        </label>
        <label className="field">
          {t.otcFeeRecipient}
          <input value={otcFeeRecipientInput} onChange={(event) => setOtcFeeRecipientInput(event.target.value)} />
        </label>
        <div className="actions">
          <button className="primary-btn" type="button" onClick={() => void executeAction("otc-fee", async () => {
            validateAddress(otcFeeRecipientInput);
            await updateOtcFeeConfig(provider!, parseBpsInput(otcFeeBpsInput), otcFeeRecipientInput.trim());
          }, lang === "zh" ? "OTC 配置已更新。" : "OTC config updated.")} disabled={actionKey !== ""}>
            {actionKey === "otc-fee" ? t.loading : t.saveOtcConfig}
          </button>
        </div>
      </Card>

      <Card title={t.swapControls} hint={t.contractManagement}>
        <KVRow label={t.currentStatus} value={swapPausedState ? t.paused : t.running} />
        <div className="actions">
          <button className="primary-btn" type="button" onClick={() => void executeAction("pause-swap", () => pauseSwap(provider!), lang === "zh" ? "Swap 已暂停。" : "Swap paused.")} disabled={swapPausedState || actionKey !== ""}>
            {actionKey === "pause-swap" ? t.loading : t.pauseSwap}
          </button>
          <button className="ghost-btn" type="button" onClick={() => void executeAction("unpause-swap", () => unpauseSwap(provider!), lang === "zh" ? "Swap 已恢复。" : "Swap unpaused.")} disabled={!swapPausedState || actionKey !== ""}>
            {actionKey === "unpause-swap" ? t.loading : t.unpauseSwap}
          </button>
        </div>
      </Card>

      <Card title={t.swapPoolConfigTitle} hint={t.statisticsAnalysis} className="grid-full">
        <div className="admin-pool-list">
          {swapPools.map((pool) => (
            <div key={pool.pairId} className="list-item">
              <div className="list-head">
                <strong>{pool.label}</strong>
                <span>{pool.exists ? t.running : "Not Created"}</span>
              </div>
              <KVRow label="token0" value={pool.token0 || "-"} />
              <KVRow label="token1" value={pool.token1 || "-"} />
              <KVRow label="reserve0" value={String(pool.reserve0)} />
              <KVRow label="reserve1" value={String(pool.reserve1)} />
              <label className="field">
                {t.swapPoolFee}
                <input value={pool.feeBpsInput} onChange={(event) => updateSwapPoolInput(pool.pairId, { feeBpsInput: event.target.value })} />
              </label>
              <label className="field">
                {t.swapImpactLimit}
                <input value={pool.impactBpsInput} onChange={(event) => updateSwapPoolInput(pool.pairId, { impactBpsInput: event.target.value })} />
              </label>
              <div className="actions admin-actions-tight">
                <button className="primary-btn" type="button" onClick={() => void executeAction(`swap-pool-${pool.pairId}`, async () => {
                  await updateSwapPoolConfig(provider!, pool.pairId, parseBpsInput(pool.feeBpsInput), parseBpsInput(pool.impactBpsInput));
                }, lang === "zh" ? `${pool.label} 已更新。` : `${pool.label} updated.`)} disabled={!pool.exists || actionKey !== ""}>
                  {actionKey === `swap-pool-${pool.pairId}` ? t.loading : t.saveSwapPool}
                </button>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card title={t.lightConfigTitle} hint={t.contractManagement} className="grid-full">
        <KVRow label={t.lightVaultBalance} value={`${String(lightFeeVault)} LIGHT`} />
        <div className="admin-form-grid">
          <label className="field">
            {t.burnBps}
            <input value={lightConfigInput.burnBps} onChange={(event) => setLightConfigInput((current) => ({ ...current, burnBps: event.target.value }))} />
          </label>
          <label className="field">
            {t.bootstrapBps}
            <input value={lightConfigInput.bootstrapBps} onChange={(event) => setLightConfigInput((current) => ({ ...current, bootstrapBps: event.target.value }))} />
          </label>
          <label className="field">
            {t.nodeBps}
            <input value={lightConfigInput.nodeBps} onChange={(event) => setLightConfigInput((current) => ({ ...current, nodeBps: event.target.value }))} />
          </label>
          <label className="field">
            {t.superNodeBps}
            <input value={lightConfigInput.superNodeBps} onChange={(event) => setLightConfigInput((current) => ({ ...current, superNodeBps: event.target.value }))} />
          </label>
        </div>
        <label className="field">
          {t.bootstrapRecipient}
          <input value={lightConfigInput.bootstrapRecipient} onChange={(event) => setLightConfigInput((current) => ({ ...current, bootstrapRecipient: event.target.value }))} />
        </label>
        <label className="field">
          {t.nodeRecipient}
          <input value={lightConfigInput.nodeRecipient} onChange={(event) => setLightConfigInput((current) => ({ ...current, nodeRecipient: event.target.value }))} />
        </label>
        <label className="field">
          {t.superNodeRecipient}
          <input value={lightConfigInput.superNodeRecipient} onChange={(event) => setLightConfigInput((current) => ({ ...current, superNodeRecipient: event.target.value }))} />
        </label>
        <div className="actions">
          <button className="primary-btn" type="button" onClick={() => void executeAction("light-config", async () => {
            validateAddress(lightConfigInput.bootstrapRecipient);
            validateAddress(lightConfigInput.nodeRecipient);
            validateAddress(lightConfigInput.superNodeRecipient);
            await updateSwapLightFeeConfig(provider!, {
              burnBps: parseBpsInput(lightConfigInput.burnBps),
              bootstrapBps: parseBpsInput(lightConfigInput.bootstrapBps),
              nodeBps: parseBpsInput(lightConfigInput.nodeBps),
              superNodeBps: parseBpsInput(lightConfigInput.superNodeBps),
              bootstrapRecipient: lightConfigInput.bootstrapRecipient.trim(),
              nodeRecipient: lightConfigInput.nodeRecipient.trim(),
              superNodeRecipient: lightConfigInput.superNodeRecipient.trim(),
            });
          }, lang === "zh" ? "LIGHT 分账配置已更新。" : "LIGHT fee config updated.")} disabled={actionKey !== ""}>
            {actionKey === "light-config" ? t.loading : t.saveLightConfig}
          </button>
          <button className="ghost-btn" type="button" onClick={() => void executeAction("light-settle", () => settleLightFees(provider!), lang === "zh" ? "LIGHT 手续费清算已执行。" : "LIGHT fee settlement executed.")} disabled={actionKey !== "" || lightFeeVault === 0n}>
            {actionKey === "light-settle" ? t.loading : t.settleLightFees}
          </button>
        </div>
        {lightConfig ? (
          <div className="kv-list">
            <KVRow label={t.burnBps} value={lightConfig.burnBps} />
            <KVRow label={t.bootstrapBps} value={lightConfig.bootstrapBps} />
            <KVRow label={t.nodeBps} value={lightConfig.nodeBps} />
            <KVRow label={t.superNodeBps} value={lightConfig.superNodeBps} />
          </div>
        ) : null}
      </Card>
    </section>
  );
};

export default Admin;
