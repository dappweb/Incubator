import { BrowserProvider, isAddress } from "ethers";
import React, { useEffect, useMemo, useState } from "react";
import { CORE_CONTRACT_ADDRESS, LIGHT_TOKEN_ADDRESS, OTC_CONTRACT_ADDRESS, SWAP_POOL_ADDRESS, USDT_CONTRACT_ADDRESS } from "../config";
import type { CorePoolConfig } from "../lib/coreContract";
import {
    getContractOwner,
    getCorePoolConfig,
    getMachineUnitPrice,
    getNodePrice,
    getSuperNodePrice,
    isCorePaused,
    pauseCore,
    transferCoreOwnership,
    unpauseCore,
    updateCoreNodePrice,
    updateCorePoolRecipient,
    updateCorePoolShare,
    updateCoreSuperNodePrice,
    updateMachinePrice
} from "../lib/coreContract";
import { parseContractError } from "../lib/errorParser";
import { getOtcFeeConfig, updateOtcFeeConfig } from "../lib/otcContract";
import {
    getLightFeeConfig,
    getSwapFeeVault,
    getSwapPool,
    isSwapPaused,
    pauseSwap,
    settleLightFees,
    unpauseSwap,
    updateSwapLightFeeConfig,
    updateSwapPoolConfig,
    type LightFeeConfig,
    type SwapPool,
} from "../lib/swapContract";
import { formatUsdt, parseUsdt } from "../lib/usdtContract";
import { Card, KVRow } from "./Common";

type AdminTabKey = "overview" | "prices" | "pools" | "market" | "system";

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

const ADMIN_LIST_KEY = (owner: string) => `incubator_admins_${owner.toLowerCase()}`;

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
    checklistNetwork: lang === "zh" ? "确认钱包地址与合约 Owner 一致，并已切换到 CNC Mainnet。" : "Confirm the wallet matches the contract owner and is on CNC Mainnet.",
    checklistConfig: lang === "zh" ? "确认前端环境变量中的 Core / OTC / Swap 合约地址已配置。" : "Confirm Core / OTC / Swap contract addresses are configured in the frontend environment.",
    checklistFunds: lang === "zh" ? "确认管理员钱包有足够 CNC 支付 Gas。" : "Confirm the admin wallet has enough CNC for gas.",
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
    corePrices: lang === "zh" ? "算力 / 节点 / 超级节点价格" : "Machine / Node / Super-Node Prices",
    corePricesHint: lang === "zh" ? "在下方表格中直接修改算力、节点、超级节点的购买价格，修改后立即上链生效。" : "Edit machine, node and super-node purchase prices in the table below. Changes take effect on-chain immediately.",
    paramName: lang === "zh" ? "参数" : "Parameter",
    currentValue: lang === "zh" ? "当前值" : "Current",
    newValue: lang === "zh" ? "新值" : "New Value",
    actionColumn: lang === "zh" ? "操作" : "Action",
    saveParam: lang === "zh" ? "保存" : "Save",
    saveMachinePrice: lang === "zh" ? "保存算力价格" : "Save Machine Price",
    saveNodePrice: lang === "zh" ? "保存节点价格" : "Save Node Price",
    saveSuperPrice: lang === "zh" ? "保存超级节点价格" : "Save Super Price",
    machineUnitPrice: lang === "zh" ? "算力单价" : "Machine Price",
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

    // 合约地址管理
    contractAddressTitle: lang === "zh" ? "合约地址管理" : "Contract Addresses",
    contractAddressHint: lang === "zh" ? "当前前端配置的所有合约地址。" : "All contract addresses configured in the frontend.",
    usdtAddress: lang === "zh" ? "USDT 地址" : "USDT Address",

    // 多管理员
    multiAdminTitle: lang === "zh" ? "多管理员管理" : "Admin Management",
    multiAdminHint: lang === "zh" ? "添加可查看管理后台的子管理员地址（仅 Owner 可修改，链上写操作仍需 Owner 钱包）。" : "Add sub-admin addresses that can view the admin panel. Only the owner can modify this list; on-chain writes still require the owner wallet.",
    subAdminList: lang === "zh" ? "当前子管理员列表" : "Current Sub-Admins",
    noSubAdmins: lang === "zh" ? "暂无子管理员" : "No sub-admins",
    addSubAdmin: lang === "zh" ? "添加子管理员" : "Add Sub-Admin",
    removeSubAdmin: lang === "zh" ? "移除" : "Remove",
    newAdminAddress: lang === "zh" ? "新管理员地址" : "New Admin Address",
    adminAdded: lang === "zh" ? "子管理员已添加。" : "Sub-admin added.",
    adminRemoved: lang === "zh" ? "子管理员已移除。" : "Sub-admin removed.",
    adminAlreadyExists: lang === "zh" ? "该地址已是管理员。" : "Address is already an admin.",

    // Owner 转让
    ownerTransferTitle: lang === "zh" ? "Owner 转让" : "Transfer Ownership",
    ownerTransferHint: lang === "zh" ? "将合约 Owner 永久转让给新地址，操作不可逆！" : "Permanently transfer contract ownership to a new address. This action is irreversible!",
    newOwnerAddress: lang === "zh" ? "新 Owner 地址" : "New Owner Address",
    transferOwnerBtn: lang === "zh" ? "确认转让 Owner" : "Confirm Transfer",
    ownerTransferred: lang === "zh" ? "Owner 已成功转让。" : "Ownership transferred successfully.",
    ownerTransferWarning: lang === "zh" ? "⚠️ 操作不可逆！请务必确认新地址正确，本操作执行后当前钱包将失去合约控制权。" : "⚠️ Irreversible! Confirm the new address is correct. After this action, the current wallet loses all contract control.",
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

  // 底部 Tab 状态
  const [adminTab, setAdminTab] = useState<AdminTabKey>("overview");

  // 多管理员
  const [subAdmins, setSubAdmins] = useState<string[]>(() => {
    if (!contractOwner) return [];
    try {
      return JSON.parse(localStorage.getItem(ADMIN_LIST_KEY(contractOwner)) ?? "[]") as string[];
    } catch {
      return [];
    }
  });
  const [newAdminInput, setNewAdminInput] = useState("");

  // Owner 转让
  const [newOwnerInput, setNewOwnerInput] = useState("");

  const isOwner = Boolean(address && contractOwner && address.toLowerCase() === contractOwner.toLowerCase());
  const isAdmin = isOwner || subAdmins.some((a) => a.toLowerCase() === address?.toLowerCase());

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

  const corePriceRows = [
    {
      key: "machine-price",
      label: t.machineUnitPrice,
      currentValue: machinePrice,
      inputValue: machinePriceInput,
      setInputValue: setMachinePriceInput,
      onSave: () => updateMachinePrice(provider!, parsePriceInput(machinePriceInput)),
      successMessage: lang === "zh" ? "算力价格已更新。" : "Machine price updated.",
    },
    {
      key: "node-price",
      label: t.nodePrice,
      currentValue: nodePrice,
      inputValue: nodePriceInput,
      setInputValue: setNodePriceInput,
      onSave: () => updateCoreNodePrice(provider!, parsePriceInput(nodePriceInput)),
      successMessage: lang === "zh" ? "节点价格已更新。" : "Node price updated.",
    },
    {
      key: "super-price",
      label: t.superNodePrice,
      currentValue: superPrice,
      inputValue: superPriceInput,
      setInputValue: setSuperPriceInput,
      onSave: () => updateCoreSuperNodePrice(provider!, parsePriceInput(superPriceInput)),
      successMessage: lang === "zh" ? "超级节点价格已更新。" : "Super-node price updated.",
    },
  ];

  const addSubAdmin = () => {
    const normalized = newAdminInput.trim();
    if (!isAddress(normalized)) {
      setLocalStatus(t.invalidAddress);
      onStatusChange(t.invalidAddress);
      return;
    }
    if (subAdmins.some((a) => a.toLowerCase() === normalized.toLowerCase())) {
      setLocalStatus(t.adminAlreadyExists);
      onStatusChange(t.adminAlreadyExists);
      return;
    }
    const next = [...subAdmins, normalized];
    setSubAdmins(next);
    localStorage.setItem(ADMIN_LIST_KEY(resolvedOwner), JSON.stringify(next));
    setNewAdminInput("");
    setLocalStatus(t.adminAdded);
    onStatusChange(t.adminAdded);
  };

  const removeSubAdmin = (target: string) => {
    const next = subAdmins.filter((a) => a.toLowerCase() !== target.toLowerCase());
    setSubAdmins(next);
    localStorage.setItem(ADMIN_LIST_KEY(resolvedOwner), JSON.stringify(next));
    setLocalStatus(t.adminRemoved);
    onStatusChange(t.adminRemoved);
  };

  if (!isAdmin) {
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

  const ADMIN_TABS: Array<{ key: AdminTabKey; label: string; icon: string }> = [
    { key: "overview", label: lang === "zh" ? "总览" : "Overview", icon: "🏠" },
    { key: "prices",   label: lang === "zh" ? "价格" : "Prices",   icon: "💰" },
    { key: "pools",    label: lang === "zh" ? "资金池" : "Pools",   icon: "🏦" },
    { key: "market",   label: lang === "zh" ? "市场" : "Market",   icon: "🔄" },
    { key: "system",   label: lang === "zh" ? "权限" : "System",   icon: "⚙️" },
  ];

  return (
    <div className="admin-layout">
      {/* ── 顶部状态栏 ── */}
      <div className="admin-topbar">
        <span className="admin-topbar-title">{t.adminTitle}</span>
        <div className="admin-topbar-meta">
          <span className={`admin-status-badge ${corePaused ? "paused" : "running"}`}>
            Core {corePaused ? t.paused : t.running}
          </span>
          <span className={`admin-status-badge ${swapPausedState ? "paused" : "running"}`}>
            Swap {swapPausedState ? t.paused : t.running}
          </span>
          <button
            className="ghost-btn"
            style={{ fontSize: "12px", padding: "6px 12px", minHeight: "32px" }}
            type="button"
            onClick={() => void loadAdminState()}
            disabled={isLoadingState || Boolean(actionKey)}
          >
            {isLoadingState ? t.loading : "↻ " + t.refresh}
          </button>
        </div>
      </div>

      {localStatus ? <p className="status" style={{ margin: "0 0 8px" }}>{localStatus}</p> : null}

      {/* ── Tab 内容区 ── */}
      <div className="admin-tab-content">

        {/* ════ 总览 ════ */}
        {adminTab === "overview" && (
          <section className="grid">
            <Card title={t.adminSummary} hint={t.adminHint}>
              <KVRow label={t.ownerAddress} value={resolvedOwner} />
              <KVRow label={t.currentAddress} value={address} />
              <KVRow label={`${t.currentStatus} Core`} value={corePaused ? t.paused : t.running} />
              <KVRow label={`${t.currentStatus} Swap`} value={swapPausedState ? t.paused : t.running} />
            </Card>

            <Card title={t.contractAddressTitle} hint={t.contractAddressHint}>
              <KVRow label={t.coreAddress}  value={CORE_CONTRACT_ADDRESS  || "-"} />
              <KVRow label={t.otcAddress}   value={OTC_CONTRACT_ADDRESS   || "-"} />
              <KVRow label={t.swapAddress}  value={SWAP_POOL_ADDRESS      || "-"} />
              <KVRow label={t.lightAddress} value={LIGHT_TOKEN_ADDRESS    || "-"} />
              <KVRow label={t.usdtAddress}  value={USDT_CONTRACT_ADDRESS  || "-"} />
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
                <button className="primary-btn" type="button"
                  onClick={() => void executeAction("pause-core", () => pauseCore(provider!), lang === "zh" ? "Core 已暂停。" : "Core paused.")}
                  disabled={corePaused || actionKey !== ""}>
                  {actionKey === "pause-core" ? t.loading : t.pauseCore}
                </button>
                <button className="ghost-btn" type="button"
                  onClick={() => void executeAction("unpause-core", () => unpauseCore(provider!), lang === "zh" ? "Core 已恢复。" : "Core unpaused.")}
                  disabled={!corePaused || actionKey !== ""}>
                  {actionKey === "unpause-core" ? t.loading : t.unpauseCore}
                </button>
              </div>
            </Card>

            <Card title={t.swapControls} hint={t.contractManagement}>
              <KVRow label={t.currentStatus} value={swapPausedState ? t.paused : t.running} />
              <div className="actions">
                <button className="primary-btn" type="button"
                  onClick={() => void executeAction("pause-swap", () => pauseSwap(provider!), lang === "zh" ? "Swap 已暂停。" : "Swap paused.")}
                  disabled={swapPausedState || actionKey !== ""}>
                  {actionKey === "pause-swap" ? t.loading : t.pauseSwap}
                </button>
                <button className="ghost-btn" type="button"
                  onClick={() => void executeAction("unpause-swap", () => unpauseSwap(provider!), lang === "zh" ? "Swap 已恢复。" : "Swap unpaused.")}
                  disabled={!swapPausedState || actionKey !== ""}>
                  {actionKey === "unpause-swap" ? t.loading : t.unpauseSwap}
                </button>
              </div>
            </Card>
          </section>
        )}

        {/* ════ 价格配置 ════ */}
        {adminTab === "prices" && (
          <section className="grid">
            <Card title={t.corePrices} hint={t.corePricesHint} className="grid-full">
              {/* 当前链上价格回显 */}
              <div className="admin-price-echo">
                <div className="admin-price-echo-item">
                  <span>{t.machineUnitPrice}</span>
                  <strong className="admin-price-echo-val">{formatUsdt(machinePrice)} USDT</strong>
                </div>
                <div className="admin-price-echo-item">
                  <span>{t.nodePrice}</span>
                  <strong className="admin-price-echo-val">{formatUsdt(nodePrice)} USDT</strong>
                </div>
                <div className="admin-price-echo-item">
                  <span>{t.superNodePrice}</span>
                  <strong className="admin-price-echo-val">{formatUsdt(superPrice)} USDT</strong>
                </div>
              </div>

              {/* 修改表格 */}
              <div className="table-wrap admin-param-table-wrap" style={{ marginTop: "16px" }}>
                <table className="admin-param-table">
                  <thead>
                    <tr>
                      <th>{t.paramName}</th>
                      <th>{t.currentValue} (USDT)</th>
                      <th>{t.newValue} (USDT)</th>
                      <th>{t.actionColumn}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {corePriceRows.map((row) => (
                      <tr key={row.key}>
                        <td>{row.label}</td>
                        <td>
                          <span className="admin-current-val">{formatUsdt(row.currentValue)}</span>
                        </td>
                        <td>
                          <input
                            className="admin-param-input"
                            value={row.inputValue}
                            onChange={(event) => row.setInputValue(event.target.value)}
                            inputMode="decimal"
                            placeholder={formatUsdt(row.currentValue)}
                          />
                        </td>
                        <td>
                          <div className="admin-param-actions">
                            <button
                              className="primary-btn"
                              type="button"
                              onClick={() => void executeAction(row.key, row.onSave, row.successMessage)}
                              disabled={actionKey !== ""}
                            >
                              {actionKey === row.key ? t.loading : t.saveParam}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </section>
        )}

        {/* ════ 资金池 ════ */}
        {adminTab === "pools" && (
          <section className="grid">
            <Card title={t.poolConfigTitle} hint={t.poolConfigHint} className="grid-full">
              <div className="admin-pool-list">
                {poolConfigs.map((pool, index) => (
                  <div key={pool.label} className="list-item">
                    <div className="list-head">
                      <strong>{pool.label}</strong>
                      <span>{pool.bps} BPS ({(pool.bps / 100).toFixed(1)}%)</span>
                    </div>
                    {/* 当前数据回显 */}
                    <div className="admin-pool-echo">
                      <KVRow label={t.recipient} value={pool.recipient || "-"} />
                      <KVRow label={t.shareBps} value={`${pool.bps} BPS`} />
                    </div>
                    {/* 修改接收地址 */}
                    <label className="field" style={{ marginTop: "8px" }}>
                      {lang === "zh" ? "新接收地址" : "New Recipient"}
                      <input
                        value={pool.recipientInput}
                        placeholder={pool.recipient}
                        onChange={(event) => updatePoolConfigInput(index, { recipientInput: event.target.value })}
                      />
                    </label>
                    <div className="actions admin-actions-tight">
                      <button className="ghost-btn" type="button"
                        onClick={() => void executeAction(`pool-recipient-${index}`, async () => {
                          validateAddress(pool.recipientInput);
                          await updateCorePoolRecipient(provider!, index, pool.recipientInput.trim());
                        }, lang === "zh" ? `${pool.label} 接收地址已更新。` : `${pool.label} recipient updated.`)}
                        disabled={actionKey !== ""}>
                        {actionKey === `pool-recipient-${index}` ? t.loading : t.saveRecipient}
                      </button>
                    </div>
                    {/* 修改比例 */}
                    <label className="field" style={{ marginTop: "8px" }}>
                      {lang === "zh" ? "新比例(BPS)" : "New Share(BPS)"}
                      <input
                        value={pool.bpsInput}
                        placeholder={String(pool.bps)}
                        onChange={(event) => updatePoolConfigInput(index, { bpsInput: event.target.value })}
                      />
                    </label>
                    <div className="actions admin-actions-tight">
                      <button className="primary-btn" type="button"
                        onClick={() => void executeAction(`pool-share-${index}`, async () => {
                          await updateCorePoolShare(provider!, index, parseBpsInput(pool.bpsInput));
                        }, lang === "zh" ? `${pool.label} 比例已更新。` : `${pool.label} share updated.`)}
                        disabled={actionKey !== ""}>
                        {actionKey === `pool-share-${index}` ? t.loading : t.saveShare}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </section>
        )}

        {/* ════ 市场 / 兑换 ════ */}
        {adminTab === "market" && (
          <section className="grid">
            {/* OTC 配置 */}
            <Card title={t.otcConfigTitle} hint={t.contractManagement}>
              {/* 当前数据回显 */}
              <div className="admin-pool-echo">
                <KVRow label={t.otcFeeRate} value={`${(otcFeeBps / 100).toFixed(2)}%`} />
                <KVRow label={t.otcFeeRecipient} value={otcFeeRecipient || "-"} />
              </div>
              {/* 修改 */}
              <label className="field" style={{ marginTop: "12px" }}>
                {t.otcFeeRate} (BPS)
                <input
                  value={otcFeeBpsInput}
                  placeholder={String(otcFeeBps)}
                  onChange={(event) => setOtcFeeBpsInput(event.target.value)}
                />
              </label>
              <label className="field">
                {t.otcFeeRecipient}
                <input
                  value={otcFeeRecipientInput}
                  placeholder={otcFeeRecipient}
                  onChange={(event) => setOtcFeeRecipientInput(event.target.value)}
                />
              </label>
              <div className="actions">
                <button className="primary-btn" type="button"
                  onClick={() => void executeAction("otc-fee", async () => {
                    validateAddress(otcFeeRecipientInput);
                    await updateOtcFeeConfig(provider!, parseBpsInput(otcFeeBpsInput), otcFeeRecipientInput.trim());
                  }, lang === "zh" ? "OTC 配置已更新。" : "OTC config updated.")}
                  disabled={actionKey !== ""}>
                  {actionKey === "otc-fee" ? t.loading : t.saveOtcConfig}
                </button>
              </div>
            </Card>

            {/* Swap 池配置 */}
            <Card title={t.swapPoolConfigTitle} hint={t.statisticsAnalysis} className="grid-full">
              <div className="admin-pool-list">
                {swapPools.map((pool) => (
                  <div key={pool.pairId} className="list-item">
                    <div className="list-head">
                      <strong>{pool.label}</strong>
                      <span>{pool.exists ? t.running : "Not Created"}</span>
                    </div>
                    {/* 数据回显 */}
                    <div className="admin-pool-echo">
                      <KVRow label="token0"   value={pool.token0 || "-"} />
                      <KVRow label="token1"   value={pool.token1 || "-"} />
                      <KVRow label="reserve0" value={String(pool.reserve0)} />
                      <KVRow label="reserve1" value={String(pool.reserve1)} />
                      <KVRow label={t.swapPoolFee}    value={`${pool.feeBps} BPS`} />
                      <KVRow label={t.swapImpactLimit} value={`${pool.maxPriceImpactBps} BPS`} />
                    </div>
                    {/* 修改 */}
                    <label className="field" style={{ marginTop: "8px" }}>
                      {lang === "zh" ? "新手续费(BPS)" : "New Fee(BPS)"}
                      <input
                        value={pool.feeBpsInput}
                        placeholder={String(pool.feeBps)}
                        onChange={(event) => updateSwapPoolInput(pool.pairId, { feeBpsInput: event.target.value })}
                      />
                    </label>
                    <label className="field">
                      {lang === "zh" ? "新冲击上限(BPS)" : "New Impact Limit(BPS)"}
                      <input
                        value={pool.impactBpsInput}
                        placeholder={String(pool.maxPriceImpactBps)}
                        onChange={(event) => updateSwapPoolInput(pool.pairId, { impactBpsInput: event.target.value })}
                      />
                    </label>
                    <div className="actions admin-actions-tight">
                      <button className="primary-btn" type="button"
                        onClick={() => void executeAction(`swap-pool-${pool.pairId}`, async () => {
                          await updateSwapPoolConfig(provider!, pool.pairId, parseBpsInput(pool.feeBpsInput), parseBpsInput(pool.impactBpsInput));
                        }, lang === "zh" ? `${pool.label} 已更新。` : `${pool.label} updated.`)}
                        disabled={!pool.exists || actionKey !== ""}>
                        {actionKey === `swap-pool-${pool.pairId}` ? t.loading : t.saveSwapPool}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            {/* LIGHT 配置 */}
            <Card title={t.lightConfigTitle} hint={t.contractManagement} className="grid-full">
              {/* 数据回显 */}
              <div className="admin-pool-echo">
                <KVRow label={t.lightVaultBalance} value={`${String(lightFeeVault)} LIGHT`} />
                {lightConfig ? (
                  <>
                    <KVRow label={t.burnBps}      value={`${lightConfig.burnBps} BPS`}      />
                    <KVRow label={t.bootstrapBps} value={`${lightConfig.bootstrapBps} BPS`} />
                    <KVRow label={t.nodeBps}      value={`${lightConfig.nodeBps} BPS`}      />
                    <KVRow label={t.superNodeBps} value={`${lightConfig.superNodeBps} BPS`} />
                  </>
                ) : null}
              </div>
              {/* 修改 */}
              <div className="admin-form-grid" style={{ marginTop: "12px" }}>
                <label className="field">
                  {t.burnBps}
                  <input value={lightConfigInput.burnBps} onChange={(event) => setLightConfigInput((c) => ({ ...c, burnBps: event.target.value }))} />
                </label>
                <label className="field">
                  {t.bootstrapBps}
                  <input value={lightConfigInput.bootstrapBps} onChange={(event) => setLightConfigInput((c) => ({ ...c, bootstrapBps: event.target.value }))} />
                </label>
                <label className="field">
                  {t.nodeBps}
                  <input value={lightConfigInput.nodeBps} onChange={(event) => setLightConfigInput((c) => ({ ...c, nodeBps: event.target.value }))} />
                </label>
                <label className="field">
                  {t.superNodeBps}
                  <input value={lightConfigInput.superNodeBps} onChange={(event) => setLightConfigInput((c) => ({ ...c, superNodeBps: event.target.value }))} />
                </label>
              </div>
              <label className="field">
                {t.bootstrapRecipient}
                <input value={lightConfigInput.bootstrapRecipient} onChange={(event) => setLightConfigInput((c) => ({ ...c, bootstrapRecipient: event.target.value }))} />
              </label>
              <label className="field">
                {t.nodeRecipient}
                <input value={lightConfigInput.nodeRecipient} onChange={(event) => setLightConfigInput((c) => ({ ...c, nodeRecipient: event.target.value }))} />
              </label>
              <label className="field">
                {t.superNodeRecipient}
                <input value={lightConfigInput.superNodeRecipient} onChange={(event) => setLightConfigInput((c) => ({ ...c, superNodeRecipient: event.target.value }))} />
              </label>
              <div className="actions">
                <button className="primary-btn" type="button"
                  onClick={() => void executeAction("light-config", async () => {
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
                  }, lang === "zh" ? "LIGHT 分账配置已更新。" : "LIGHT fee config updated.")}
                  disabled={actionKey !== ""}>
                  {actionKey === "light-config" ? t.loading : t.saveLightConfig}
                </button>
                <button className="ghost-btn" type="button"
                  onClick={() => void executeAction("light-settle", () => settleLightFees(provider!), lang === "zh" ? "LIGHT 手续费清算已执行。" : "LIGHT fee settlement executed.")}
                  disabled={actionKey !== "" || lightFeeVault === 0n}>
                  {actionKey === "light-settle" ? t.loading : t.settleLightFees}
                </button>
              </div>
            </Card>
          </section>
        )}

        {/* ════ 权限 / 系统 ════ */}
        {adminTab === "system" && (
          <section className="grid">
            {/* 多管理员 */}
            <Card title={t.multiAdminTitle} hint={t.multiAdminHint}>
              <p className="hint-text" style={{ marginBottom: "0.75rem" }}>{t.subAdminList}</p>
              {subAdmins.length === 0 ? (
                <p style={{ color: "var(--color-muted, #888)", fontSize: "0.875rem" }}>{t.noSubAdmins}</p>
              ) : (
                <ul className="list" style={{ marginBottom: "0.75rem" }}>
                  {subAdmins.map((addr) => (
                    <li key={addr} className="list-item" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem" }}>
                      <span style={{ fontFamily: "monospace", fontSize: "0.8rem", wordBreak: "break-all" }}>{addr}</span>
                      {isOwner && (
                        <button className="ghost-btn" type="button" style={{ flexShrink: 0 }} onClick={() => removeSubAdmin(addr)}>
                          {t.removeSubAdmin}
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {isOwner && (
                <>
                  <label className="field">
                    {t.newAdminAddress}
                    <input value={newAdminInput} onChange={(event) => setNewAdminInput(event.target.value)} placeholder="0x..." />
                  </label>
                  <div className="actions">
                    <button className="primary-btn" type="button" onClick={addSubAdmin} disabled={!newAdminInput.trim()}>
                      {t.addSubAdmin}
                    </button>
                  </div>
                </>
              )}
            </Card>

            {/* Owner 转让 */}
            {isOwner && (
              <Card title={t.ownerTransferTitle} hint={t.ownerTransferHint}>
                <p style={{ color: "var(--color-warning, #f59e0b)", fontSize: "0.875rem", marginBottom: "0.75rem" }}>
                  {t.ownerTransferWarning}
                </p>
                <div className="admin-pool-echo">
                  <KVRow label={t.ownerAddress} value={resolvedOwner} />
                </div>
                <label className="field" style={{ marginTop: "12px" }}>
                  {t.newOwnerAddress}
                  <input value={newOwnerInput} onChange={(event) => setNewOwnerInput(event.target.value)} placeholder="0x..." />
                </label>
                <div className="actions">
                  <button
                    className="primary-btn"
                    type="button"
                    style={{ background: "var(--color-error, #dc2626)" }}
                    onClick={() => void executeAction("transfer-owner", async () => {
                      validateAddress(newOwnerInput);
                      await transferCoreOwnership(provider!, newOwnerInput.trim());
                    }, t.ownerTransferred)}
                    disabled={!newOwnerInput.trim() || actionKey !== ""}>
                    {actionKey === "transfer-owner" ? t.loading : t.transferOwnerBtn}
                  </button>
                </div>
              </Card>
            )}
          </section>
        )}
      </div>

      {/* ── 底部 Tab 菜单 ── */}
      <nav className="admin-bottom-nav">
        {ADMIN_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={`admin-nav-item ${adminTab === tab.key ? "active" : ""}`}
            onClick={() => setAdminTab(tab.key)}
          >
            <span className="admin-nav-icon">{tab.icon}</span>
            <span className="admin-nav-label">{tab.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
};

export default Admin;
