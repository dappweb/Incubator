import { BrowserProvider, formatUnits, getAddress, isAddress, parseUnits } from "ethers";
import React, { useEffect, useMemo, useState } from "react";
import { CORE_CONTRACT_ADDRESS, ICO_TOKEN_ADDRESS, JSONBIN_MASTER_KEY, LIGHT_TOKEN_ADDRESS, OTC_CONTRACT_ADDRESS, PRIMARY_SWAP_CONTROLLER_ADDRESS, SWAP_POOL_ADDRESS, USDT_CONTRACT_ADDRESS } from "../config";
import {
    createEmptyAnnouncement,
    fetchFrontendFeatureToggles,
    fetchPublishedAnnouncements,
    publishAnnouncementsToJsonBin,
    type Announcement,
    type FrontendFeatureToggles,
} from "../lib/announcements";
import type { CorePoolConfig, CoreTreasuryStatus } from "../lib/coreContract";
import {
    emergencyWithdrawCoreLight,
    emergencyWithdrawCoreUSDT,
    fundRewardPool,
    getContractOwner,
    getCorePoolConfig,
    getCoreTreasuryStatus,
    getCoreUsdtAddress,
    getCurrentDay,
    getCycleDuration,
    getIdentityMarket,
    getLeaderboardWhitelist,
    getLeaderboardWhitelistAdjustPct,
    getMachineUnitPrice,
    getNodePrice,
    getNodePurchaseResidualRecipients,
    getRewardConfig,
    getRewardPoolBalance,
    getSubAdmins,
    getSuperNodePrice,
    getSuperNodePurchaseResidualRecipients,
    isOwnerOrSubAdmin as isCoreOwnerOrSubAdmin,
    isCorePaused,
    pauseCore,
    setCoreManager,
    setCoreSubAdmin,
    setCoreUsdtAddress,
    setCycleDuration,
    setIdentityMarket,
    setLeaderboardWhitelist,
    setLeaderboardWhitelistAdjustPct,
    setNodePurchaseResidualRecipients,
    setRewardWeight,
    setSuperNodePurchaseResidualRecipients,
    settleDailyRewardsManual,
    settleLeaderboard,
    transferCoreOwnership,
    unpauseCore,
    updateCoreNodePrice,
    updateCorePoolRecipient,
    updateCorePoolShare,
    updateCoreSuperNodePrice,
    updateMachinePrice,
    updateRewardConfig,
    withdrawCoreAccumulatedPool,
    withdrawCoreLight,
    withdrawCoreUSDT
} from "../lib/coreContract";
import { parseContractError } from "../lib/errorParser";
import { cleanupLowerOrders, getOtcFeeConfig, getOtcUsdtAddress, setOtcUsdtAddress, updateOtcFeeConfig } from "../lib/otcContract";
import {
    addSwapLiquidity,
    createDefaultPools,
    distributeSwapFees,
    forceSetSellEnabled,
    getBottomPoolConfig,
    getContractPoolStats,
    getLightFeeConfig,
    getLightRealtimeDistribute,
    getPancakeV2PrimaryReserves,
    getPrimarySwapConfig,
    getPrimaryUsdtAddress,
    getSwapCycleDuration,
    getSwapFeeVault,
    getSwapPool,
    getUsdtAddress,
    getUsdtIcoPoolEnabled,
    injectBottomPool,
    isSwapPaused,
    migrateUsdtIcoLiquidity,
    pauseSwap,
    removeSwapLiquidity,
    reportIcoHolderCount,
    setLightRealtimeDistribute,
    setPairTokens as setPairTokensOnChain,
    setPrimaryUsdtAddress,
    setSwapCycleDuration as setSwapCycleDurationOnChain,
    setUsdtAddress as setUsdtAddressOnChain,
    setUsdtIcoPoolEnabled,
    settleLightFees,
    tryAutoEnableSellUsdt,
    unpauseSwap,
    updateBottomPoolConfig,
    updatePrimaryBuyFeeConfig,
    updatePrimaryPair,
    updatePrimaryRecipients,
    updatePrimarySellConfig,
    updatePrimaryThresholds,
    updateSwapLightFeeConfig,
    updateSwapPoolConfig,
    withdrawPrimaryTreasury,
    type LightFeeConfig,
    type PrimarySwapConfig,
    type SwapPool
} from "../lib/swapContract";
import {
    burnUnsold,
    getIcoTokenInfo,
    mintIcoToken,
    setBurnExecutor,
    setSaleAllocationWallet,
} from "../lib/tokenContract";
import { formatUsdt, parseUsdt } from "../lib/usdtContract";
import AdminSettlementPanel from "./AdminSettlementPanel";
import { Card, KVRow } from "./Common";

type AdminTabKey = "overview" | "prices" | "pools" | "market" | "settlement" | "primary" | "token" | "system" | "announcements" | "guide";

type RecipientInputRow = {
  id: number;
  value: string;
};

const makeRecipientRows = (values: string[]): RecipientInputRow[] => (
  values.length > 0
    ? values.map((value, index) => ({ id: index + 1, value }))
    : [{ id: 1, value: "" }]
);

interface AdminProps {
  lang: "zh" | "en";
  address: string;
  contractOwner: string;
  hasAdminAccess: boolean;
  provider: BrowserProvider | null;
  onRefresh: () => Promise<void>;
  onStatusChange: (message: string) => void;
  featureToggles: FrontendFeatureToggles;
  onFeatureTogglesChange: (next: FrontendFeatureToggles) => void;
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

type ParamGuideItem = {
  name: string;
  business: string;
  example: string;
};

const ParamGuide: React.FC<{ title: string; items: ParamGuideItem[] }> = ({ title, items }) => {
  if (!items.length) return null;
  return (
    <div className="admin-param-guide" role="note" aria-label={title}>
      <p className="admin-param-guide-title">{title}</p>
      <div className="admin-param-guide-list">
        {items.map((item) => (
          <div key={item.name} className="admin-param-guide-item">
            <p><strong>{item.name}</strong></p>
            <p>{item.business}</p>
            <p>{item.example}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

const Admin: React.FC<AdminProps> = ({ lang, address, contractOwner, hasAdminAccess, provider, onRefresh, onStatusChange, featureToggles, onFeatureTogglesChange }) => {
  const t = {
    adminTitle: lang === "zh" ? "管理后台" : "Admin Panel",
    adminHint: lang === "zh" ? "仅合约 Owner、链上授权子管理员或经理可访问此页面。" : "Only contract owner, on-chain authorized sub-admins, or managers can access this page.",
    ownerAddress: lang === "zh" ? "合约 Owner" : "Contract Owner",
    currentAddress: lang === "zh" ? "当前地址" : "Current Address",
    notOwner: lang === "zh" ? "权限不足，只有合约 Owner、链上授权子管理员或经理可访问此页面。" : "Insufficient permissions. Only the contract owner, on-chain authorized sub-admins, or managers can access this page.",
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
    leaderboardWhitelistTitle: lang === "zh" ? "排行榜白名单调节" : "Leaderboard Whitelist Adjustment",
    leaderboardWhitelistHint: lang === "zh" ? "白名单仅在排行榜结算时生效。调节范围 0-10，表示从第一名比例中扣减对应百分比并分给白名单。" : "Whitelist applies during leaderboard settlement only. Adjustment range is 0-10, deducted from rank-1 share and distributed to whitelist.",
    whitelistAddresses: lang === "zh" ? "白名单地址" : "Whitelist Addresses",
    whitelistAdjustPct: lang === "zh" ? "调节值(0-10)" : "Adjustment (0-10)",
    saveWhitelist: lang === "zh" ? "保存白名单" : "Save Whitelist",
    saveWhitelistAdjust: lang === "zh" ? "保存调节值" : "Save Adjustment",
    whitelistUpdated: lang === "zh" ? "排行榜白名单已更新。" : "Leaderboard whitelist updated.",
    whitelistAdjustUpdated: lang === "zh" ? "排行榜调节值已更新。" : "Leaderboard adjustment updated.",
    invalidAdjustRange: lang === "zh" ? "调节值必须是 0 到 10 的整数。" : "Adjustment must be an integer between 0 and 10.",
    emptyWhitelistTip: lang === "zh" ? "当前无白名单地址（表示不启用白名单分配）。" : "No whitelist addresses configured (whitelist distribution disabled).",
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
    invalidBps: lang === "zh" ? "请输入 0-10000 之间的整数 BPS" : "Enter an integer BPS between 0 and 10000",
    invalidPrice: lang === "zh" ? "请输入有效 USDT 价格" : "Enter a valid USDT price",
    invalidAmount: lang === "zh" ? "请输入大于 0 的有效数量" : "Enter a valid amount greater than 0",
    invalidInteger: lang === "zh" ? "请输入非负整数" : "Enter a non-negative integer",
    invalidCycleSeconds: lang === "zh" ? "结算周期须为 0 或 ≥60 秒" : "Cycle must be 0 or ≥60 seconds",
    invalidCleanupRole: lang === "zh" ? "身份类型须为 1(Node) 或 2(SuperNode)" : "Role must be 1 (Node) or 2 (SuperNode)",
    invalidCleanupMax: lang === "zh" ? "最大撤销数须为 ≥1 的整数" : "Max cancels must be an integer ≥ 1",
    invalidDistribution: lang === "zh" ? "接收地址与 BPS 数量不一致" : "Recipients and BPS counts do not match",
    invalidDistributionEmpty: lang === "zh" ? "请至少配置一个接收地址与 BPS" : "Provide at least one recipient and BPS",
    confirmDangerous: lang === "zh" ? "此操作无法撤销，确认继续？" : "This action cannot be undone. Continue?",
    adminDataRefreshed: lang === "zh" ? "后台数据已刷新。" : "Admin data refreshed.",
    actionSuccess: lang === "zh" ? "操作成功。" : "Action completed.",
    adminNotReady: lang === "zh" ? "钱包或 Provider 尚未就绪。" : "Wallet or provider is not ready.",

    // 合约地址管理
    contractAddressTitle: lang === "zh" ? "合约地址管理" : "Contract Addresses",
    contractAddressHint: lang === "zh" ? "当前前端配置的所有合约地址。" : "All contract addresses configured in the frontend.",
    usdtAddress: lang === "zh" ? "USDT 地址" : "USDT Address",

    // 地址设置
    addressSettingsTitle: lang === "zh" ? "链上地址管理" : "On-Chain Address Settings",
    addressSettingsHint: lang === "zh" ? "按合约分步更新 USDT 地址，每次只提交一笔交易，并可单独设置交易池 Token 对。" : "Update USDT address step by step per contract, one transaction at a time, and configure pair tokens separately.",
    pairLabel: lang === "zh" ? "交易池" : "Trading Pair",
    token0Address: lang === "zh" ? "Token 0 地址" : "Token 0 Address",
    token1Address: lang === "zh" ? "Token 1 地址" : "Token 1 Address",
    saveSwapUsdtAddress: lang === "zh" ? "更新 Swap USDT" : "Update Swap USDT",
    saveCoreUsdtAddress: lang === "zh" ? "更新 Core USDT" : "Update Core USDT",
    saveOtcUsdtAddress: lang === "zh" ? "更新 OTC USDT" : "Update OTC USDT",
    savePrimaryUsdtAddress: lang === "zh" ? "更新 Primary USDT" : "Update Primary USDT",
    swapUsdtAddress: lang === "zh" ? "Swap USDT" : "Swap USDT",
    coreUsdtAddress: lang === "zh" ? "Core USDT" : "Core USDT",
    otcUsdtAddress: lang === "zh" ? "OTC USDT" : "OTC USDT",
    primaryUsdtAddress: lang === "zh" ? "Primary USDT" : "Primary USDT",
    savePairTokens: lang === "zh" ? "保存交易池" : "Save Pair",

    // 多管理员
    multiAdminTitle: lang === "zh" ? "多管理员管理" : "Admin Management",
    multiAdminHint: lang === "zh" ? "子管理员列表保存在链上。仅 Owner 可增删子管理员。" : "Sub-admin list is stored on-chain. Only the owner can add or remove sub-admins.",
    subAdminList: lang === "zh" ? "当前子管理员列表" : "Current Sub-Admins",
    noSubAdmins: lang === "zh" ? "暂无子管理员" : "No sub-admins",
    addSubAdmin: lang === "zh" ? "添加子管理员" : "Add Sub-Admin",
    removeSubAdmin: lang === "zh" ? "移除" : "Remove",
    removing: lang === "zh" ? "移除中..." : "Removing...",
    confirmRemoveSubAdmin: lang === "zh" ? "确认移除此子管理员？" : "Confirm removing this sub-admin?",
    newAdminAddress: lang === "zh" ? "新管理员地址" : "New Admin Address",
    adminAdded: lang === "zh" ? "子管理员已添加。" : "Sub-admin added.",
    adminRemoved: lang === "zh" ? "子管理员已移除。" : "Sub-admin removed.",
    adminAlreadyExists: lang === "zh" ? "该地址已是管理员。" : "Address is already an admin.",
    managerTitle: lang === "zh" ? "经理管理" : "Manager Management",
    managerHint: lang === "zh" ? "Owner 与 SubAdmin 可增删经理。经理仅可调整配置参数并执行 OTC 下架（低价清理）。" : "Owner and sub-admins can add/remove managers. Managers can only adjust configuration parameters and run OTC delist cleanup.",
    managerList: lang === "zh" ? "当前经理列表" : "Current Managers",
    noManagers: lang === "zh" ? "暂无经理" : "No managers",
    addManager: lang === "zh" ? "添加经理" : "Add Manager",
    removeManager: lang === "zh" ? "移除经理" : "Remove Manager",
    newManagerAddress: lang === "zh" ? "新经理地址" : "New Manager Address",
    managerAdded: lang === "zh" ? "经理已添加。" : "Manager added.",
    managerRemoved: lang === "zh" ? "经理已移除。" : "Manager removed.",
    managerAlreadyExists: lang === "zh" ? "该地址已是经理。" : "Address is already a manager.",

    // Owner 转让
    ownerTransferTitle: lang === "zh" ? "Owner 转让" : "Transfer Ownership",
    ownerTransferHint: lang === "zh" ? "将合约 Owner 永久转让给新地址，操作不可逆！" : "Permanently transfer contract ownership to a new address. This action is irreversible!",
    newOwnerAddress: lang === "zh" ? "新 Owner 地址" : "New Owner Address",
    transferOwnerBtn: lang === "zh" ? "确认转让 Owner" : "Confirm Transfer",
    ownerTransferred: lang === "zh" ? "Owner 已成功转让。" : "Ownership transferred successfully.",
    ownerTransferWarning: lang === "zh" ? "⚠️ 操作不可逆！请务必确认新地址正确，本操作执行后当前钱包将失去合约控制权。" : "⚠️ Irreversible! Confirm the new address is correct. After this action, the current wallet loses all contract control.",
    featureToggleTitle: lang === "zh" ? "前端功能开关" : "Frontend Feature Toggles",
    featureToggleHint: lang === "zh" ? "关闭后前端将隐藏并禁用对应入口。发布后全站生效。" : "When disabled, the corresponding entry is hidden and blocked in frontend. Publish to apply globally.",
    toggleHomeMachine: lang === "zh" ? "首页购买算力" : "Home Machine Purchase",
    toggleMarket: lang === "zh" ? "市场" : "Market",
    toggleSwap: lang === "zh" ? "兑换" : "Swap",
    featureToggleSaved: lang === "zh" ? "功能开关已更新，点击发布后生效。" : "Feature toggles updated. Click Publish to apply.",
  };

  const guideLabel = lang === "zh" ? "参数业务说明与案例" : "Parameter Business Notes & Examples";
  const biz = (zh: string, en: string) => (lang === "zh" ? zh : en);
  const paramGuides = useMemo(() => ({
    addressSettings: [
      { name: "USDT 地址", business: biz("决定系统计价与结算资产，更新后会影响 Core/OTC/Primary/Swap 的转账目标。", "Defines pricing and settlement asset across contracts."), example: biz("示例：旧 USDT 迁移到新合约后，把四个 USDT 地址都切到新地址，避免扣款失败。", "Example: migrate all USDT pointers to a new token contract.") },
      { name: "Token0 / Token1 地址", business: biz("定义交易对资产顺序，错误配置会导致报价和结算方向错乱。", "Defines pair token ordering for quote/swap logic."), example: biz("示例：主池应为 USDT/ICO；回收池应为 LIGHT/ICO。", "Example: primary USDT/ICO, recovery LIGHT/ICO.") },
    ],
    corePrices: [
      { name: "算力单价", business: biz("用户购买矿机时的单台成本，直接影响入金门槛。", "Unit cost of machine purchase."), example: biz("示例：从 100 调整到 120，买 10 台总额由 1000 变 1200。", "Example: 100 -> 120 changes 10 units from 1000 to 1200.") },
      { name: "节点价格", business: biz("节点身份购买价格，影响节点入场速度与节点池增速。", "Node identity purchase price."), example: biz("示例：市场过热可上调节点价格抑制抢购。", "Example: raise during overheating demand.") },
      { name: "超级节点价格", business: biz("超级节点身份购买价格，影响高阶权益获取成本。", "Super-node identity purchase price."), example: biz("示例：从 3000 调到 3500 以提高门槛。", "Example: 3000 -> 3500 to raise barrier.") },
    ],
    corePools: [
      { name: "接收地址", business: biz("指定每个池子的收款钱包或合约地址。", "Recipient wallet/contract for each pool."), example: biz("示例：平台池改为财务冷钱包，便于审计和提取。", "Example: route platform pool to treasury cold wallet.") },
      { name: "比例(BPS)", business: biz("控制订单金额在各池子中的分配占比。", "Controls allocation ratio across pools."), example: biz("示例：2000 BPS=20%；所有池子总和必须 10000。", "Example: 2000 BPS = 20%; total must be 10000.") },
    ],
    whitelist: [
      { name: "调节值(0-10)", business: biz("排行榜结算时对白名单加权，数值越大白名单分配越高。", "Whitelist adjustment used in leaderboard settlement."), example: biz("示例：调节值 5，表示从第1名比例扣减部分分给白名单。", "Example: adjustment 5 reallocates part of rank-1 share.") },
      { name: "白名单地址", business: biz("仅这些地址可参与白名单分配。", "Only these addresses receive whitelist allocation."), example: biz("示例：输入 3 个运营地址，日结时按规则分配。", "Example: add 3 operation wallets for whitelist settlement.") },
    ],
    otc: [
      { name: "手续费(BPS)", business: biz("OTC 成交抽成比例。", "OTC trade fee ratio."), example: biz("示例：1000 BPS=10%；成交 100 USDT 抽成 10 USDT。", "Example: 1000 BPS=10%, fee 10 on 100 trade.") },
      { name: "手续费接收地址", business: biz("OTC 手续费归集钱包。", "Recipient wallet for OTC fees."), example: biz("示例：配置到平台财务地址统一记账。", "Example: route to treasury wallet.") },
    ],
    swapPools: [
      { name: "池手续费(BPS)", business: biz("兑换时池子收取的手续费率。", "Pool swap fee rate."), example: biz("示例：30 BPS=0.3%；输入 1000，手续费约 3。", "Example: 30 BPS = 0.3%." ) },
      { name: "冲击上限(BPS)", business: biz("限制单笔交易允许的最大价格冲击，防止深度被打穿。", "Max allowed price impact per trade."), example: biz("示例：300 BPS=3%；超过则前端提示风险/拒绝。", "Example: 300 BPS = 3% threshold.") },
    ],
    light: [
      { name: "Burn / Bootstrap / Node / SuperNode BPS", business: biz("定义 LIGHT 手续费分账比例。", "Defines LIGHT fee split ratios."), example: biz("示例：6000/3000/700/300 表示 60%销毁，30%回流，7%节点，3%超节。", "Example split 60/30/7/3.") },
      { name: "分账接收地址", business: biz("定义各子池接收人地址。", "Recipients for each LIGHT fee bucket."), example: biz("示例：节点池接收地址改为节点奖励发放合约。", "Example: set node bucket recipient to reward distributor.") },
    ],
    cycle: [
      { name: "结算周期(秒)", business: biz("控制 Core+Swap 结算节奏，0 代表默认 1 天。", "Settlement cadence in seconds; 0 means 1 day default."), example: biz("示例：测试网设为 600 秒快速验证，主网建议 86400 秒。", "Example: 600s on testnet, 86400s on mainnet.") },
    ],
    fundReward: [
      { name: "金额(LIGHT)", business: biz("向奖励池注入可发放资金。", "Funding amount into reward pool."), example: biz("示例：注入 1000 LIGHT 作为当天结算预算。", "Example: fund 1000 LIGHT for daily settlement.") },
    ],
    rewardConfig: [
      { name: "Daily/Imm Burn/Sec Burn/Static/Dynamic/Cap BPS", business: biz("控制每日释放、销毁与静动态奖励比例及封顶。", "Controls release, burn, static/dynamic split and cap."), example: biz("示例：Daily=200 表示每日释放池子的 2%。", "Example: Daily 200 => release 2% each cycle.") },
    ],
    manualSettle: [
      { name: "每日结算参与者地址", business: biz("指定本轮参与日结的地址集合。", "Address set for daily settlement."), example: biz("示例：输入 A,B,C，仅对三者执行本轮日结。", "Example: settle only A/B/C this cycle.") },
      { name: "排行榜 Day ID", business: biz("指定要结算的榜单日编号。", "Day id to settle leaderboard."), example: biz("示例：输入 42，结算第 42 天榜单。", "Example: day 42 leaderboard.") },
      { name: "节点/超级节点接收地址与份额", business: biz("手动分配池余额到指定地址。", "Manual split of pool to recipients."), example: biz("示例：两地址份额 7000,3000 即 7:3 分配。", "Example: 7000/3000 split.") },
      { name: "平台池接收地址与份额", business: biz("手动填写平台池分账地址与份额（总和=10000）并执行结算。", "Manually input platform pool recipients/shares (sum=10000) and settle."), example: biz("示例：A/B/C=5000/3000/2000，点击『平台池结算』。", "Example: A/B/C=5000/3000/2000 then settle platform pool.") },
    ],
    identityWeightWithdraw: [
      { name: "身份市场地址", business: biz("定义身份资产交易市场合约。", "Identity market contract pointer."), example: biz("示例：升级市场合约后更新到新地址。", "Example: point to upgraded market contract.") },
      { name: "地址 + 权重值", business: biz("配置奖励权重账户，用于结算加权。", "Weighted account config for rewards."), example: biz("示例：运营地址权重 100，普通地址权重 50。", "Example: ops 100 vs normal 50.") },
      { name: "提取地址 + 提取数量", business: biz("从 Core 合约提取 USDT 到目标地址。", "Withdraw USDT from Core to target address."), example: biz("示例：提取 5000 USDT 到多签财务钱包。", "Example: withdraw 5000 USDT to multisig.") },
    ],
    cleanup: [
      { name: "身份类型 + 最大撤销数", business: biz("批量清理低价 OTC 订单。", "Batch cleanup low-price OTC listings."), example: biz("示例：类型=1，最大=50，单次最多处理 50 个节点单。", "Example: role 1, max 50 listings.") },
    ],
    primaryBuy: [
      { name: "Buy / SuperNode / NodePool / Contract BPS", business: biz("定义一级市场买入手续费及其分账结构。", "Primary buy fee and split structure."), example: biz("示例：Buy=500，Super=200，Node=100，Contract=200。", "Example: total 500 split 200/100/200.") },
    ],
    primarySell: [
      { name: "Sell/Burn/ContractICO/LiquidityICO BPS", business: biz("定义卖出时 USDT 抽成与 ICO 去向比例。", "Defines sell fee and ICO routing split."), example: biz("示例：Burn=1000, ContractICO=2000, LiquidityICO=7000。", "Example: 10/20/70 sell ICO split.") },
    ],
    primaryRecipients: [
      { name: "SuperNode/NodePool/Contract Recipient", business: biz("仅影响 USDT→ICO 兑换时的手续费分账接收人，不影响购买算力/节点/超级节点的资金分发。", "Only affects fee split recipients on USDT→ICO swaps. Does NOT affect machine/node/super-node purchase allocation."), example: biz("示例：Contract 接收地址配置为结算外部地址。购买算力的 Platform 接收人请到『资金池』页修改。", "Example: set Contract recipient to settlement address. To change machine-purchase Platform recipient, use the Pools tab.") },
    ],
    primaryThreshold: [
      { name: "最低 USDT 储备 + 最低持有人数", business: biz("满足后才允许启用卖出。", "Prerequisites for enabling sell."), example: biz("示例：储备>=5000万且持有人>=10万才开放卖出。", "Example: reserve and holders must pass threshold.") },
      { name: "上报持有人数 + Pair 地址", business: biz("同步外部统计与交易对地址。", "Sync external holder metrics and pair pointer."), example: biz("示例：主流交易所换池后更新 Pair 地址。", "Example: update pair after DEX migration.") },
    ],
    primaryWithdraw: [
      { name: "卖出开关", business: biz("强制启停一级市场卖出。", "Force enable/disable sell."), example: biz("示例：流动性异常时临时关闭卖出。", "Example: disable sell during liquidity stress.") },
      { name: "提取 Token/To/Amount", business: biz("从一级市场控制器提取资产。", "Withdraw treasury assets from primary controller."), example: biz("示例：提取 USDT 到多签地址做再分配。", "Example: withdraw to multisig for redistribution.") },
    ],
    tokenMintBurn: [
      { name: "Mint 接收地址 + 数量", business: biz("增发 ICO 到指定地址。", "Mint ICO token to recipient."), example: biz("示例：给运营地址铸造 10000 ICO 用于活动。", "Example: mint 10k ICO for campaign.") },
      { name: "Burn Unsold 数量", business: biz("销毁未售库存，减少流通压力。", "Burn unsold inventory."), example: biz("示例：销毁 50000 ICO 以降低抛压。", "Example: burn 50k ICO to reduce sell pressure.") },
    ],
    tokenExecutor: [
      { name: "Executor 地址 + 启用状态", business: biz("配置可执行销毁权限的地址。", "Manage burn executor permissions."), example: biz("示例：启用自动化脚本钱包作为执行人。", "Example: enable automation wallet as executor.") },
      { name: "销售钱包地址", business: biz("指定销售配额资金钱包。", "Wallet holding sale allocation."), example: biz("示例：迁移销售钱包到新多签。", "Example: move sale wallet to new multisig.") },
    ],
    tokenLiquidity: [
      { name: "PairId + Amount0/Amount1 + To", business: biz("添加/移除流动性时的目标池与数量配置。", "Pool and amount config for add/remove liquidity."), example: biz("示例：Pair 0 添加 1万 USDT 与等值 ICO。", "Example: add 10k USDT and ICO on pair 0.") },
    ],
    tokenDistribution: [
      { name: "手续费分发参数", business: biz("按收款地址和 BPS 分发手续费。", "Distribute collected fees by recipients and BPS."), example: biz("示例：A/B 两地址按 7000/3000 分配。", "Example: recipients split 70/30.") },
      { name: "默认池创建参数", business: biz("初始化池手续费与冲击上限。", "Initialize default pool fee and impact caps."), example: biz("示例：USDT/ICO=30bps, LIGHT/ICO=30bps, 冲击=300bps。", "Example: 30/30 fee with 300 bps impact cap.") },
    ],
    systemAdmin: [
      { name: "子管理员地址", business: biz("授予或撤销系统级管理权限。", "Grant/revoke system-level admin rights."), example: biz("示例：新增技术同事地址用于日常配置。", "Example: add ops engineer as sub-admin.") },
      { name: "经理地址", business: biz("授予价格与公告管理权限。", "Grant manager role for price/announcements."), example: biz("示例：运营地址可改价格但不能改系统权限。", "Example: manager can edit prices, not system auth.") },
      { name: "新 Owner 地址", business: biz("合约控制权迁移目标地址。", "Ownership transfer target."), example: biz("示例：迁移到治理多签地址接管系统。", "Example: transfer ownership to governance multisig.") },
    ],
  }), [lang]);

  const poolLabels = useMemo(
    () => [
      lang === "zh" ? "LP 底池" : "Liquidity",
      lang === "zh" ? "直推池" : "Referral",
      lang === "zh" ? "超级节点池" : "Super Node",
      lang === "zh" ? "节点池" : "Node",
      lang === "zh" ? "平台池" : "Platform",
      lang === "zh" ? "排行榜池" : "Leaderboard",
      lang === "zh" ? "契约池" : "Contract",
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
  const [leaderboardWhitelist, setLeaderboardWhitelistState] = useState<string[]>([]);
  const [leaderboardWhitelistInput, setLeaderboardWhitelistInput] = useState("");
  const [leaderboardAdjustPct, setLeaderboardAdjustPct] = useState(0);
  const [leaderboardAdjustInput, setLeaderboardAdjustInput] = useState("0");
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

  // 地址设置
  const [usdtAddress, setUsdtAddress] = useState("");
  const [coreUsdtAddress, setCoreUsdtAddressState] = useState("");
  const [otcUsdtAddress, setOtcUsdtAddressState] = useState("");
  const [primaryUsdtAddress, setPrimaryUsdtAddressState] = useState("");
  const [usdtAddressInput, setUsdtAddressInput] = useState("");
  const [pairTokens, setPairTokensState] = useState<Array<{ token0: string; token1: string }>>([]);
  const [pairTokensInputs, setPairTokensInputs] = useState<Array<{ token0Input: string; token1Input: string }>>([]);

  // 底部 Tab 状态
  const [adminTab, setAdminTab] = useState<AdminTabKey>("overview");

  // 多管理员
  const [subAdmins, setSubAdmins] = useState<string[]>([]);
  const [newAdminInput, setNewAdminInput] = useState("");
  const [currentHasAdminRole, setCurrentHasAdminRole] = useState(false);
  const [newManagerInput, setNewManagerInput] = useState("");

  // Owner 转让
  const [newOwnerInput, setNewOwnerInput] = useState("");

  // ── 结算 tab state ──
  const [rewardPoolBalance, setRewardPoolBalance] = useState<bigint>(0n);
  const [identityMarket, setIdentityMarketState] = useState("");
  const [rewardConfig, setRewardConfigState] = useState<import("../lib/coreContract").RewardConfig | null>(null);
  const [coreCycleDuration, setCoreCycleDuration] = useState<bigint>(0n);
  const [swapCycleDuration, setSwapCycleDuration] = useState<bigint>(0n);
  const [currentDayId, setCurrentDayId] = useState<bigint>(0n);
  const [cycleDurationInput, setCycleDurationInput] = useState("");
  const [settlementInputs, setSettlementInputs] = useState({
    fundAmount: "", identityMarket: "",
    dailyBps: "", immBurnBps: "", secBurnBps: "", staticBps: "", dynamicBps: "", capBps: "", burnAddr: "",
    rewardWeight: "", rewardWeightAddr: "", withdrawTo: "", withdrawAmount: "",
    cleanupRole: "1", cleanupMax: "50",
    settleDailyAddrs: "", settleLeaderDayId: "",
    settleNodeAddrs: "", settleNodeShares: "",
    settleSuperAddrs: "", settleSuperShares: "",
    settleNodeCandidates: "", settleSuperCandidates: "",
    settlePlatformAddrs: "", settlePlatformShares: "",
    backfillUsers: "",
    treasuryWithdrawTo: "", treasuryWithdrawAmt: "",
    treasuryPoolType: "3", treasuryPoolTo: "", treasuryPoolAmt: "",
    treasuryLightTo: "", treasuryLightAmt: "",
  });
  const [treasuryStatus, setTreasuryStatus] = useState<CoreTreasuryStatus | null>(null);
  const [treasuryLoading, setTreasuryLoading] = useState(false);
  const [nodeResidualRows, setNodeResidualRows] = useState<RecipientInputRow[]>([{ id: 1, value: "" }]);
  const [superResidualRows, setSuperResidualRows] = useState<RecipientInputRow[]>([{ id: 1, value: "" }]);

  // ── 一级市场 tab state ──
  const [primaryConfig, setPrimaryConfigState] = useState<PrimarySwapConfig | null>(null);
  const [primaryInputs, setPrimaryInputs] = useState({
    buyBps: "", superBps: "", nodeBps: "", platBps: "",
    sellBps: "", burnBps: "", platIcoBps: "", liqIcoBps: "",
    superRecip: "", nodeRecip: "", platRecip: "",
    minReserve: "", minHolders: "",
    holderCount: "", pairAddr: "",
    treasuryToken: "", treasuryTo: "", treasuryAmount: "",
    migrateTo: "",
    bottomLpRecipient: "", bottomAutoBps: "0",
    injectUsdt: "", injectIco: "", injectMinUsdt: "0", injectMinIco: "0",
  });
  // P1/P3/P6 status state
  const [contractPoolStats, setContractPoolStatsState] = useState<{ usdtTotal: bigint; icoTotal: bigint }>({ usdtTotal: 0n, icoTotal: 0n });
  const [lightRealtime, setLightRealtimeState] = useState<boolean>(false);
  const [usdtIcoLegacyEnabled, setUsdtIcoLegacyEnabledState] = useState<boolean>(false);
  const [bottomPoolCfg, setBottomPoolCfgState] = useState<{ lpRecipient: string; autoInjectBps: number }>({ lpRecipient: "", autoInjectBps: 0 });

  // ── 代币 tab state ──
  const [icoTokenInfo, setIcoTokenInfoState] = useState<{ totalSupply: bigint; totalBurned: bigint; saleAllocationWallet: string; owner: string } | null>(null);
  const [tokenInputs, setTokenInputs] = useState({
    mintTo: "", mintAmount: "", burnAmount: "",
    executorAddr: "", executorEnabled: "true", saleWallet: "",
    liqPairId: "0", liqAmount0: "", liqAmount1: "",
    rmPairId: "0", rmAmount0: "", rmAmount1: "", rmTo: "",
    distPairId: "0", distToken: "", distRecipients: "", distBps: "",
    defFeeBpsUsdtIco: "30", defFeeBpsLightIco: "30", defMaxImpact: "300",
  });

  // ── 公告管理 tab state ──
  const [annList, setAnnList] = useState<Announcement[]>([]);
  const [annLoading, setAnnLoading] = useState(false);
  const [annEditing, setAnnEditing] = useState<Announcement | null>(null);
  const [annPublishing, setAnnPublishing] = useState(false);
  const [editingFeatureToggles, setEditingFeatureToggles] = useState<FrontendFeatureToggles>(featureToggles);

  const isOwner = Boolean(address && contractOwner && address.toLowerCase() === contractOwner.toLowerCase());
  const isSubAdmin = subAdmins.some((a) => a.toLowerCase() === address?.toLowerCase());
  const isManager = currentHasAdminRole && !isOwner && !isSubAdmin;
  const isAdmin = hasAdminAccess || isOwner || isSubAdmin || isManager;
  const canManageSystem = isOwner || isSubAdmin;
  const canManagePrices = isAdmin;
  const canManageAnnouncements = isAdmin;
  const canManageCleanup = canManageSystem || isManager;

  useEffect(() => {
    setEditingFeatureToggles(featureToggles);
  }, [featureToggles]);

  const loadAdminState = async () => {
    if (!provider) {
      setIsLoadingState(false);
      return;
    }

    if (address) {
      try {
        setCurrentHasAdminRole(await isCoreOwnerOrSubAdmin(provider, address));
      } catch {
        // Keep the previous role state when role probe fails.
      }
    }

    setIsLoadingState(true);
    try {
      const [owner, nextCorePaused, nextSwapPaused, nextMachinePrice, nextNodePrice, nextSuperPrice, nextOtcConfig, nextLightConfig, nextLightVault, nextUsdtAddress, nextCoreUsdtAddress, nextOtcUsdtAddress, nextPrimaryUsdtAddress, nextSubAdmins, nextWhitelist, nextAdjustPct] = await Promise.all([
        getContractOwner(provider),
        isCorePaused(provider),
        isSwapPaused(provider),
        getMachineUnitPrice(provider),
        getNodePrice(provider),
        getSuperNodePrice(provider),
        getOtcFeeConfig(provider),
        getLightFeeConfig(provider),
        LIGHT_TOKEN_ADDRESS ? getSwapFeeVault(provider, 1, LIGHT_TOKEN_ADDRESS) : Promise.resolve(0n),
        getUsdtAddress(provider),
        CORE_CONTRACT_ADDRESS ? getCoreUsdtAddress(provider) : Promise.resolve(""),
        OTC_CONTRACT_ADDRESS ? getOtcUsdtAddress(provider) : Promise.resolve(""),
        PRIMARY_SWAP_CONTROLLER_ADDRESS ? getPrimaryUsdtAddress(provider) : Promise.resolve(""),
        getSubAdmins(provider),
        getLeaderboardWhitelist(provider),
        getLeaderboardWhitelistAdjustPct(provider),
      ]);

      const nextPools = await Promise.all(poolLabels.map(async (label, poolType) => {
        try {
          const config = await getCorePoolConfig(provider, poolType);
          return {
            label,
            recipient: config.recipient,
            bps: config.bps,
            recipientInput: config.recipient,
            bpsInput: String(config.bps),
          };
        } catch {
          return {
            label,
            recipient: "",
            bps: 0,
            recipientInput: "",
            bpsInput: "0",
          };
        }
      }));

      const nextSwapPools = await Promise.all([
        getPancakeV2PrimaryReserves(provider),
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
      setLeaderboardWhitelistState(nextWhitelist);
      setLeaderboardWhitelistInput(nextWhitelist.join("\n"));
      setLeaderboardAdjustPct(nextAdjustPct);
      setLeaderboardAdjustInput(String(nextAdjustPct));
      setOtcFeeBps(nextOtcConfig.feeBps);
      setOtcFeeRecipient(nextOtcConfig.feeRecipient);
      setOtcFeeBpsInput(String(nextOtcConfig.feeBps));
      setOtcFeeRecipientInput(nextOtcConfig.feeRecipient);
      setSwapPools([
        { ...nextSwapPools[0], pairId: 0, label: `${t.pairPrimary} (PancakeV2)`, feeBpsInput: String(nextSwapPools[0].feeBps), impactBpsInput: String(nextSwapPools[0].maxPriceImpactBps) },
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
      setUsdtAddress(nextUsdtAddress);
      setCoreUsdtAddressState(nextCoreUsdtAddress);
      setOtcUsdtAddressState(nextOtcUsdtAddress);
      setPrimaryUsdtAddressState(nextPrimaryUsdtAddress);
      setUsdtAddressInput(nextUsdtAddress);
      setPairTokensState(nextSwapPools.map(pool => ({ token0: pool.token0, token1: pool.token1 })));
      setPairTokensInputs(nextSwapPools.map(pool => ({ token0Input: pool.token0, token1Input: pool.token1 })));
      setSubAdmins(nextSubAdmins);

      // Load settlement / primary / token data (best-effort)
      try {
        const [rPoolBal, idMarket, rwdCfg, coreCycle, swapCycle, dayId, nodeResidualRecipients, superResidualRecipients] = await Promise.all([
          getRewardPoolBalance(provider),
          getIdentityMarket(provider),
          getRewardConfig(provider),
          getCycleDuration(provider),
          getSwapCycleDuration(provider),
          getCurrentDay(provider),
          getNodePurchaseResidualRecipients(provider),
          getSuperNodePurchaseResidualRecipients(provider),
        ]);
        setRewardPoolBalance(rPoolBal);
        setIdentityMarketState(idMarket);
        setRewardConfigState(rwdCfg);
        setCoreCycleDuration(coreCycle);
        setSwapCycleDuration(swapCycle);
        setCurrentDayId(dayId);
        setCycleDurationInput(String(coreCycle === 0n ? 86400n : coreCycle));
        setNodeResidualRows(makeRecipientRows(nodeResidualRecipients));
        setSuperResidualRows(makeRecipientRows(superResidualRecipients));
      } catch { /* optional data */ }

      try {
        const pCfg = await getPrimarySwapConfig(provider);
        setPrimaryConfigState(pCfg);
        setPrimaryInputs(prev => ({
          ...prev,
          buyBps: String(pCfg.buyFeeBps), superBps: String(pCfg.superNodeFeeBps),
          nodeBps: String(pCfg.nodePoolFeeBps), platBps: String(pCfg.platformFeeBps),
          sellBps: String(pCfg.sellFeeBps), burnBps: String(pCfg.sellBurnBps),
          platIcoBps: String(pCfg.sellPlatformIcoBps), liqIcoBps: String(pCfg.sellLiquidityIcoBps),
          superRecip: pCfg.superNodeFeeRecipient, nodeRecip: pCfg.nodePoolFeeRecipient,
          platRecip: pCfg.platformRecipient, minReserve: formatUnits(pCfg.minUsdtReserve, 18),
          minHolders: String(pCfg.minIcoHolderCount), holderCount: String(pCfg.reportedIcoHolderCount),
          pairAddr: pCfg.pair,
        }));
      } catch { /* optional */ }

      // P1/P3/P6 best-effort status reads
      try {
        const [stats, realtime, legacyEnabled, bpCfg] = await Promise.all([
          getContractPoolStats(provider),
          getLightRealtimeDistribute(provider),
          getUsdtIcoPoolEnabled(provider),
          getBottomPoolConfig(provider),
        ]);
        setContractPoolStatsState(stats);
        setLightRealtimeState(realtime);
        setUsdtIcoLegacyEnabledState(legacyEnabled);
        setBottomPoolCfgState(bpCfg);
        setPrimaryInputs(prev => ({
          ...prev,
          bottomLpRecipient: bpCfg.lpRecipient,
          bottomAutoBps: String(bpCfg.autoInjectBps),
        }));
      } catch { /* optional */ }

      try {
        const tInfo = await getIcoTokenInfo(provider);
        setIcoTokenInfoState(tInfo);
      } catch { /* optional */ }
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
  }, [provider, lang, address]);

  // 自动加载公告
  useEffect(() => {
    if (adminTab === "announcements" && annList.length === 0 && !annLoading) {
      setAnnLoading(true);
      Promise.all([fetchPublishedAnnouncements(), fetchFrontendFeatureToggles()])
        .then(([rows, toggles]) => {
          setAnnList(rows);
          setEditingFeatureToggles(toggles);
          onFeatureTogglesChange(toggles);
          const m = lang === "zh" ? `已加载 ${rows.length} 条公告` : `Loaded ${rows.length} announcements`;
          setLocalStatus(m);
          onStatusChange(m);
        })
        .catch((err) => {
          console.error("[Admin] failed to autoload announcements:", err);
          const m = lang === "zh" ? `公告加载失败: ${err?.message ?? err}` : `Failed to load announcements: ${err?.message ?? err}`;
          setLocalStatus(m);
          onStatusChange(m);
        })
        .finally(() => setAnnLoading(false));
    }
  }, [adminTab, annList.length, annLoading, lang, onStatusChange, onFeatureTogglesChange]);

  const executeAction = async (key: string, action: () => Promise<void>, successMessage = t.actionSuccess) => {
    if (!provider) {
      setLocalStatus(t.adminNotReady);
      onStatusChange(t.adminNotReady);
      return;
    }

    try {
      setActionKey(key);
      const pendingMessage = lang === "zh" ? "操作已发起，请在钱包中确认。" : "Action started. Please confirm in your wallet.";
      setLocalStatus(pendingMessage);
      onStatusChange(pendingMessage);
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

  // 对任意大小写的 0x 地址都宽容（以太坊地址大小写仅用于 EIP-55 校验和，不影响唯一性）。
  // 成功返回已校验和化的地址；失败抛出 i18n 错误。
  const normalizeAddress = (value: string): string => {
    const raw = (value ?? "").trim();
    if (!raw) throw new Error(t.invalidAddress);
    // 先试原始形式（可能已是 EIP-55）
    if (isAddress(raw)) {
      try { return getAddress(raw); } catch { /* fallthrough */ }
    }
    // 回退到全小写（规避 EIP-55 校验和错误）
    const lower = raw.toLowerCase();
    if (/^0x[0-9a-f]{40}$/.test(lower)) {
      try { return getAddress(lower); } catch { /* fallthrough */ }
    }
    throw new Error(t.invalidAddress);
  };

  const validateAddress = (value: string) => {
    normalizeAddress(value);
  };

  const parseBpsInput = (value: string) => {
    const parsed = Number((value ?? "").trim());
    if (!Number.isInteger(parsed) || parsed < 0 || parsed > 10000) {
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

  const parseAdjustInput = (value: string) => {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 0 || parsed > 10) {
      throw new Error(t.invalidAdjustRange);
    }
    return parsed;
  };

  // 正数数量（使用 18 位精度解析，拒绝 0/负数/非法）
  const parsePositiveAmount = (value: string, decimals = 18) => {
    let parsed: bigint;
    try {
      parsed = parseUnits(((value ?? "").trim() || "0"), decimals);
    } catch {
      throw new Error(t.invalidAmount);
    }
    if (parsed <= 0n) throw new Error(t.invalidAmount);
    return parsed;
  };

  // 正数 USDT（按 USDT 18 位精度，拒绝 0/负数/非法）
  const parsePositiveUsdt = (value: string) => {
    try {
      const parsed = parseUsdt(value);
      if (parsed <= 0n) throw new Error(t.invalidAmount);
      return parsed;
    } catch {
      throw new Error(t.invalidAmount);
    }
  };

  // 正整数 wei（仅允许数字字符，拒绝 0）
  const parsePositiveWei = (value: string) => {
    const v = (value ?? "").trim();
    if (!/^\d+$/.test(v)) throw new Error(t.invalidAmount);
    const parsed = BigInt(v);
    if (parsed <= 0n) throw new Error(t.invalidAmount);
    return parsed;
  };

  // 非负整数 BigInt（允许 0 和空）
  const parseNonNegativeBigInt = (value: string) => {
    const v = (value ?? "").trim() || "0";
    if (!/^\d+$/.test(v)) throw new Error(t.invalidInteger);
    return BigInt(v);
  };

  // 结算周期：0 或 >=60
  const parseCycleSecondsInput = (value: string) => {
    const v = (value ?? "").trim() || "0";
    if (!/^\d+$/.test(v)) throw new Error(t.invalidCycleSeconds);
    const n = BigInt(v);
    if (n !== 0n && n < 60n) throw new Error(t.invalidCycleSeconds);
    return n;
  };

  const updateRecipientRows = (
    setter: React.Dispatch<React.SetStateAction<RecipientInputRow[]>>,
    id: number,
    value: string,
  ) => {
    setter((current) => current.map((row) => (row.id === id ? { ...row, value } : row)));
  };

  const addRecipientRow = (setter: React.Dispatch<React.SetStateAction<RecipientInputRow[]>>) => {
    setter((current) => {
      const nextId = current.reduce((max, row) => Math.max(max, row.id), 0) + 1;
      return [...current, { id: nextId, value: "" }];
    });
  };

  const removeRecipientRow = (
    setter: React.Dispatch<React.SetStateAction<RecipientInputRow[]>>,
    id: number,
  ) => {
    setter((current) => {
      if (current.length === 1) {
        return [{ id: current[0].id, value: "" }];
      }
      return current.filter((row) => row.id !== id);
    });
  };

  const collectRecipientRows = (rows: RecipientInputRow[], emptyError: string) => {
    const recipients = rows.map((row) => row.value.trim()).filter(Boolean);
    if (recipients.length === 0) {
      throw new Error(emptyError);
    }
    return recipients.map(normalizeAddress);
  };

  const parseWhitelistInput = (value: string) => {
    const rows = value
      .split(/\r?\n|,/)
      .map((item) => item.trim())
      .filter(Boolean);

    const dedup = new Set<string>();
    const normalized: string[] = [];

    for (const row of rows) {
      const addr = normalizeAddress(row);
      const lower = addr.toLowerCase();
      if (dedup.has(lower)) continue;
      dedup.add(lower);
      normalized.push(addr);
    }

    return normalized;
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
    void executeAction("add-sub-admin", async () => {
      await setCoreSubAdmin(provider!, normalized, true);
      setNewAdminInput("");
    }, t.adminAdded);
  };

  const removeSubAdmin = (target: string) => {
    if (!window.confirm(t.confirmRemoveSubAdmin)) {
      return;
    }
    void executeAction(`remove-sub-admin-${target.toLowerCase()}`, async () => {
      await setCoreSubAdmin(provider!, target, false);
    }, t.adminRemoved);
  };

  const addManager = () => {
    const normalized = newManagerInput.trim();
    if (!isAddress(normalized)) {
      setLocalStatus(t.invalidAddress);
      onStatusChange(t.invalidAddress);
      return;
    }
    void executeAction("add-manager", async () => {
      await setCoreManager(provider!, normalized, true);
      setNewManagerInput("");
    }, t.managerAdded);
  };

  const removeManager = (target: string) => {
    void executeAction(`remove-manager-${target.toLowerCase()}`, async () => {
      await setCoreManager(provider!, target, false);
    }, t.managerRemoved);
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
    { key: "overview",    label: lang === "zh" ? "总览" : "Overview",      icon: "🏠" },
    { key: "prices",      label: lang === "zh" ? "价格" : "Prices",        icon: "💰" },
    { key: "pools",       label: lang === "zh" ? "资金池" : "Pools",       icon: "🏦" },
    { key: "market",      label: lang === "zh" ? "市场" : "Market",        icon: "🔄" },
    { key: "settlement",  label: lang === "zh" ? "结算" : "Settlement",    icon: "📊" },
    { key: "primary",     label: lang === "zh" ? "一级市场" : "Primary",   icon: "🔀" },
    { key: "token",       label: lang === "zh" ? "代币" : "Token",         icon: "🪙" },
    { key: "system",      label: lang === "zh" ? "权限" : "System",        icon: "⚙️" },
    { key: "announcements", label: lang === "zh" ? "公告" : "Announcements", icon: "📢" },
    { key: "guide",       label: lang === "zh" ? "说明" : "Guide",         icon: "📖" },
  ];

  const visibleAdminTabs = ADMIN_TABS.filter((tab) => {
    if (tab.key === "overview" || tab.key === "guide") return true;
    if (tab.key === "prices") return canManagePrices;
    if (tab.key === "announcements") return canManageAnnouncements;
    if (tab.key === "settlement") return canManageCleanup;
    return canManageSystem;
  });

  useEffect(() => {
    if (!visibleAdminTabs.some((tab) => tab.key === adminTab)) {
      setAdminTab("overview");
    }
  }, [adminTab, visibleAdminTabs]);

  return (
    <div className="admin-layout">
      {/* ── 顶部 Tab 导航 ── */}
      <nav className="admin-top-nav">
        {visibleAdminTabs.map((tab) => (
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
              <KVRow label={t.swapUsdtAddress} value={usdtAddress || USDT_CONTRACT_ADDRESS || "-"} />
              <KVRow label={t.coreUsdtAddress} value={coreUsdtAddress || "-"} />
              <KVRow label={t.otcUsdtAddress} value={otcUsdtAddress || "-"} />
              <KVRow label={t.primaryUsdtAddress} value={primaryUsdtAddress || "-"} />
            </Card>

            <Card title={t.addressSettingsTitle} hint={t.addressSettingsHint} className="grid-full">
              <ParamGuide title={guideLabel} items={paramGuides.addressSettings} />
              {/* USDT 地址 */}
              <div className="admin-setting-section">
                <div className="admin-pool-echo">
                  <KVRow label={t.swapUsdtAddress} value={usdtAddress || "-"} />
                  <KVRow label={t.coreUsdtAddress} value={coreUsdtAddress || "-"} />
                  <KVRow label={t.otcUsdtAddress} value={otcUsdtAddress || "-"} />
                  <KVRow label={t.primaryUsdtAddress} value={primaryUsdtAddress || "-"} />
                </div>
                <label className="field" style={{ marginTop: "12px" }}>
                  {t.usdtAddress}
                  <input
                    value={usdtAddressInput}
                    placeholder={usdtAddress}
                    onChange={(e) => setUsdtAddressInput(e.target.value)}
                  />
                </label>
                <div className="actions admin-actions-tight">
                  <button className="primary-btn" type="button"
                    onClick={() => void executeAction("set-swap-usdt", async () => {
                      validateAddress(usdtAddressInput);
                      await setUsdtAddressOnChain(provider!, usdtAddressInput.trim());
                    }, lang === "zh" ? "Swap 的 USDT 地址已更新。" : "Swap USDT address updated.")}
                    disabled={actionKey !== ""}>
                    {actionKey === "set-swap-usdt" ? t.loading : t.saveSwapUsdtAddress}
                  </button>
                  {CORE_CONTRACT_ADDRESS ? (
                    <button className="primary-btn" type="button"
                      onClick={() => void executeAction("set-core-usdt", async () => {
                        validateAddress(usdtAddressInput);
                        await setCoreUsdtAddress(provider!, usdtAddressInput.trim());
                      }, lang === "zh" ? "Core 的 USDT 地址已更新。" : "Core USDT address updated.")}
                      disabled={actionKey !== ""}>
                      {actionKey === "set-core-usdt" ? t.loading : t.saveCoreUsdtAddress}
                    </button>
                  ) : null}
                  {OTC_CONTRACT_ADDRESS ? (
                    <button className="primary-btn" type="button"
                      onClick={() => void executeAction("set-otc-usdt", async () => {
                        validateAddress(usdtAddressInput);
                        await setOtcUsdtAddress(provider!, usdtAddressInput.trim());
                      }, lang === "zh" ? "OTC 的 USDT 地址已更新。" : "OTC USDT address updated.")}
                      disabled={actionKey !== ""}>
                      {actionKey === "set-otc-usdt" ? t.loading : t.saveOtcUsdtAddress}
                    </button>
                  ) : null}
                  {PRIMARY_SWAP_CONTROLLER_ADDRESS ? (
                    <button className="primary-btn" type="button"
                      onClick={() => void executeAction("set-primary-usdt", async () => {
                        validateAddress(usdtAddressInput);
                        await setPrimaryUsdtAddress(provider!, usdtAddressInput.trim());
                      }, lang === "zh" ? "Primary 的 USDT 地址已更新。" : "Primary USDT address updated.")}
                      disabled={actionKey !== ""}>
                      {actionKey === "set-primary-usdt" ? t.loading : t.savePrimaryUsdtAddress}
                    </button>
                  ) : null}
                </div>
              </div>

              {/* Pair Token 地址 */}
              <div className="admin-setting-section" style={{ marginTop: "24px" }}>
                {pairTokens.map((pair, pairId) => (
                  <div key={pairId} style={{ marginBottom: "16px", paddingBottom: "16px", borderBottom: "1px solid var(--border-color, #ddd)" }}>
                    <div className="admin-pool-echo">
                      <strong>{t.pairLabel} {pairId}</strong>
                      <KVRow label={t.token0Address} value={pair.token0 || "-"} />
                      <KVRow label={t.token1Address} value={pair.token1 || "-"} />
                    </div>
                    <label className="field" style={{ marginTop: "12px" }}>
                      {t.token0Address}
                      <input
                        value={pairTokensInputs[pairId]?.token0Input || ""}
                        placeholder={pair.token0}
                        onChange={(e) => {
                          const newInputs = [...pairTokensInputs];
                          newInputs[pairId] = { ...newInputs[pairId], token0Input: e.target.value };
                          setPairTokensInputs(newInputs);
                        }}
                      />
                    </label>
                    <label className="field">
                      {t.token1Address}
                      <input
                        value={pairTokensInputs[pairId]?.token1Input || ""}
                        placeholder={pair.token1}
                        onChange={(e) => {
                          const newInputs = [...pairTokensInputs];
                          newInputs[pairId] = { ...newInputs[pairId], token1Input: e.target.value };
                          setPairTokensInputs(newInputs);
                        }}
                      />
                    </label>
                    <div className="actions admin-actions-tight">
                      <button className="primary-btn" type="button"
                        onClick={() => void executeAction(`set-pair-${pairId}`, async () => {
                          const input = pairTokensInputs[pairId];
                          validateAddress(input.token0Input);
                          validateAddress(input.token1Input);
                          await setPairTokensOnChain(provider!, pairId, input.token0Input.trim(), input.token1Input.trim());
                        }, lang === "zh" ? `交易池 ${pairId} Token 已更新。` : `Pair ${pairId} tokens updated.`)}
                        disabled={actionKey !== ""}>
                        {actionKey === `set-pair-${pairId}` ? t.loading : t.savePairTokens}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
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
        {adminTab === "prices" && canManagePrices && (
          <section className="grid">
            <Card title={t.corePrices} hint={t.corePricesHint} className="grid-full">
              <ParamGuide title={guideLabel} items={paramGuides.corePrices} />
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
        {adminTab === "pools" && canManageSystem && (
          <section className="grid">
            <Card title={t.poolConfigTitle} hint={t.poolConfigHint} className="grid-full">
              <ParamGuide title={guideLabel} items={paramGuides.corePools} />
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
                        disabled={index === 0}
                        onChange={(event) => updatePoolConfigInput(index, { recipientInput: event.target.value })}
                      />
                    </label>
                    {index === 0 ? (
                      <p className="hint-text" style={{ marginTop: 6 }}>
                        {lang === "zh"
                          ? "Liquidity 地址由系统管理并直接注入 Swap，不在 Admin 手动配置。"
                          : "Liquidity recipient is system-managed and directly injected into Swap."}
                      </p>
                    ) : null}
                    {index === 6 ? (
                      <p className="hint-text" style={{ marginTop: 6 }}>
                        {lang === "zh"
                          ? "Contract 池需配置外部结算地址，池内金额按链内累积口径处理。"
                          : "Contract pool requires an external settlement address while balances accrue in-contract."}
                      </p>
                    ) : null}
                    <div className="actions admin-actions-tight">
                      <button className="ghost-btn" type="button"
                        onClick={() => void executeAction(`pool-recipient-${index}`, async () => {
                          validateAddress(pool.recipientInput);
                          await updateCorePoolRecipient(provider!, index, pool.recipientInput.trim());
                        }, lang === "zh" ? `${pool.label} 接收地址已更新。` : `${pool.label} recipient updated.`)}
                        disabled={actionKey !== "" || index === 0}>
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

            <Card title={t.leaderboardWhitelistTitle} hint={t.leaderboardWhitelistHint} className="grid-full">
              <ParamGuide title={guideLabel} items={paramGuides.whitelist} />
              <div className="admin-pool-echo">
                <KVRow label={t.whitelistAdjustPct} value={String(leaderboardAdjustPct)} />
                <KVRow
                  label={t.whitelistAddresses}
                  value={leaderboardWhitelist.length > 0 ? String(leaderboardWhitelist.length) : t.emptyWhitelistTip}
                />
              </div>

              <label className="field" style={{ marginTop: "12px" }}>
                {t.whitelistAdjustPct}
                <input
                  value={leaderboardAdjustInput}
                  onChange={(event) => setLeaderboardAdjustInput(event.target.value)}
                  placeholder="0"
                />
              </label>
              <div className="actions admin-actions-tight">
                <button
                  className="primary-btn"
                  type="button"
                  onClick={() => void executeAction("leaderboard-adjust", async () => {
                    await setLeaderboardWhitelistAdjustPct(provider!, parseAdjustInput(leaderboardAdjustInput));
                  }, t.whitelistAdjustUpdated)}
                  disabled={actionKey !== ""}
                >
                  {actionKey === "leaderboard-adjust" ? t.loading : t.saveWhitelistAdjust}
                </button>
              </div>

              <label className="field" style={{ marginTop: "12px" }}>
                {t.whitelistAddresses}
                <textarea
                  value={leaderboardWhitelistInput}
                  onChange={(event) => setLeaderboardWhitelistInput(event.target.value)}
                  rows={5}
                  placeholder={lang === "zh" ? "每行一个地址，或用英文逗号分隔" : "One address per line, or comma-separated"}
                />
              </label>
              <div className="actions admin-actions-tight">
                <button
                  className="ghost-btn"
                  type="button"
                  onClick={() => void executeAction("leaderboard-whitelist", async () => {
                    await setLeaderboardWhitelist(provider!, parseWhitelistInput(leaderboardWhitelistInput));
                  }, t.whitelistUpdated)}
                  disabled={actionKey !== ""}
                >
                  {actionKey === "leaderboard-whitelist" ? t.loading : t.saveWhitelist}
                </button>
              </div>
            </Card>
          </section>
        )}

        {/* ════ 市场 / 兑换 ════ */}
        {adminTab === "market" && canManageSystem && (
          <section className="grid">
            {/* OTC 配置 */}
            <Card title={t.otcConfigTitle} hint={t.contractManagement}>
              <ParamGuide title={guideLabel} items={paramGuides.otc} />
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
              <ParamGuide title={guideLabel} items={paramGuides.swapPools} />
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
              <ParamGuide title={guideLabel} items={paramGuides.light} />
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

        {/* ════ 结算 ════ */}
        {adminTab === "settlement" && canManageSystem && (
          <section className="grid">
            <Card title={lang === "zh" ? "奖励池概况" : "Reward Pool Overview"} hint={lang === "zh" ? "查看奖励池余额及配置参数" : "View reward pool balance and config"}>
              <KVRow label={lang === "zh" ? "奖励池余额 (LIGHT)" : "Reward Pool (LIGHT)"} value={formatUsdt(rewardPoolBalance)} />
              <KVRow label={lang === "zh" ? "身份市场合约" : "Identity Market"} value={identityMarket || "-"} />
              {rewardConfig && (
                <>
                  <KVRow label="Daily BPS" value={String(rewardConfig.releaseDailyBps)} />
                  <KVRow label="Immediate Burn BPS" value={String(rewardConfig.releaseImmediateBurnBps)} />
                  <KVRow label="Secondary Burn BPS" value={String(rewardConfig.releaseSecondaryBurnBps)} />
                  <KVRow label="Static BPS" value={String(rewardConfig.releaseStaticBps)} />
                  <KVRow label="Dynamic BPS" value={String(rewardConfig.releaseDynamicBps)} />
                  <KVRow label="Reward Cap BPS" value={String(rewardConfig.rewardCapBps)} />
                </>
              )}
            </Card>

            <Card title={lang === "zh" ? "⏱ 结算周期" : "⏱ Settlement Cycle"} hint={lang === "zh" ? "设置结算周期（秒），0=默认1天。同步修改 Core 和 Swap 合约" : "Set cycle duration (seconds), 0=default 1 day. Updates both Core and Swap contracts"}>
              <ParamGuide title={guideLabel} items={paramGuides.cycle} />
              <div className="admin-pool-echo">
                <KVRow label={lang === "zh" ? "当前 Day ID" : "Current Day ID"} value={String(currentDayId)} />
                <KVRow label={lang === "zh" ? "Core 周期" : "Core Cycle"} value={coreCycleDuration === 0n ? `86400s (${lang === "zh" ? "默认1天" : "default 1 day"})` : `${coreCycleDuration}s (${Math.round(Number(coreCycleDuration) / 60)} min)`} />
                <KVRow label={lang === "zh" ? "Swap 周期" : "Swap Cycle"} value={swapCycleDuration === 0n ? `86400s (${lang === "zh" ? "默认1天" : "default 1 day"})` : `${swapCycleDuration}s (${Math.round(Number(swapCycleDuration) / 60)} min)`} />
              </div>
              <label className="field" style={{ marginTop: "12px" }}>
                {lang === "zh" ? "新周期（秒）" : "New Cycle (seconds)"}
                <input value={cycleDurationInput} onChange={e => setCycleDurationInput(e.target.value)} placeholder="600" />
              </label>
              <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", margin: "4px 0 8px" }}>
                {lang === "zh"
                  ? "常用: 0=1天(生产), 300=5分钟, 600=10分钟, 3600=1小时。最小60秒"
                  : "Common: 0=1day(prod), 300=5min, 600=10min, 3600=1hr. Min 60s"}
              </p>
              <div className="actions" style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                {[
                  { label: "5 min", val: "300" },
                  { label: "10 min", val: "600" },
                  { label: "1 hr", val: "3600" },
                  { label: lang === "zh" ? "1天(生产)" : "1 day(prod)", val: "0" },
                ].map(preset => (
                  <button key={preset.val} className="ghost-btn" type="button" style={{ fontSize: "12px", padding: "4px 10px", minHeight: "28px" }}
                    onClick={() => setCycleDurationInput(preset.val)}>
                    {preset.label}
                  </button>
                ))}
              </div>
              <div className="actions" style={{ marginTop: "8px" }}>
                <button className="primary-btn" type="button"
                  onClick={() => void executeAction("set-cycle", async () => {
                    const dur = parseCycleSecondsInput(cycleDurationInput);
                    await setCycleDuration(provider!, dur);
                    await setSwapCycleDurationOnChain(provider!, dur);
                  }, lang === "zh" ? "结算周期已更新（Core + Swap）。" : "Settlement cycle updated (Core + Swap).")}
                  disabled={actionKey !== ""}>
                  {actionKey === "set-cycle" ? t.loading : lang === "zh" ? "设置周期" : "Set Cycle"}
                </button>
              </div>
            </Card>

            <Card title={lang === "zh" ? "注入奖励池" : "Fund Reward Pool"} hint={lang === "zh" ? "向奖励池转入 LIGHT" : "Transfer LIGHT into reward pool"}>
              <ParamGuide title={guideLabel} items={paramGuides.fundReward} />
              <label className="field">{lang === "zh" ? "金额 (LIGHT)" : "Amount (LIGHT)"}
                <input value={settlementInputs.fundAmount} onChange={e => setSettlementInputs(p => ({ ...p, fundAmount: e.target.value }))} placeholder="100" />
              </label>
              <div className="actions">
                <button className="primary-btn" type="button"
                  onClick={() => void executeAction("fund-reward", async () => {
                    await fundRewardPool(provider!, parsePositiveAmount(settlementInputs.fundAmount));
                  }, lang === "zh" ? "奖励池注入成功。" : "Reward pool funded.")} disabled={actionKey !== ""}>
                  {actionKey === "fund-reward" ? t.loading : lang === "zh" ? "注入" : "Fund"}
                </button>
              </div>
            </Card>

            <Card title={lang === "zh" ? "更新分配比例" : "Update Reward Config"} hint={lang === "zh" ? "修改释放 BPS 配置" : "Update release BPS config"} className="grid-full">
              <ParamGuide title={guideLabel} items={paramGuides.rewardConfig} />
              <div className="admin-form-grid">
                <label className="field">Daily BPS<input value={settlementInputs.dailyBps} onChange={e => setSettlementInputs(p => ({ ...p, dailyBps: e.target.value }))} placeholder={rewardConfig ? String(rewardConfig.releaseDailyBps) : ""} /></label>
                <label className="field">Imm Burn BPS<input value={settlementInputs.immBurnBps} onChange={e => setSettlementInputs(p => ({ ...p, immBurnBps: e.target.value }))} placeholder={rewardConfig ? String(rewardConfig.releaseImmediateBurnBps) : ""} /></label>
                <label className="field">Sec Burn BPS<input value={settlementInputs.secBurnBps} onChange={e => setSettlementInputs(p => ({ ...p, secBurnBps: e.target.value }))} placeholder={rewardConfig ? String(rewardConfig.releaseSecondaryBurnBps) : ""} /></label>
                <label className="field">Static BPS<input value={settlementInputs.staticBps} onChange={e => setSettlementInputs(p => ({ ...p, staticBps: e.target.value }))} placeholder={rewardConfig ? String(rewardConfig.releaseStaticBps) : ""} /></label>
                <label className="field">Dynamic BPS<input value={settlementInputs.dynamicBps} onChange={e => setSettlementInputs(p => ({ ...p, dynamicBps: e.target.value }))} placeholder={rewardConfig ? String(rewardConfig.releaseDynamicBps) : ""} /></label>
                <label className="field">Cap BPS<input value={settlementInputs.capBps} onChange={e => setSettlementInputs(p => ({ ...p, capBps: e.target.value }))} placeholder={rewardConfig ? String(rewardConfig.rewardCapBps) : ""} /></label>
              </div>
              <div className="actions">
                <button className="primary-btn" type="button"
                  onClick={() => void executeAction("update-reward-cfg", async () => {
                    await updateRewardConfig(provider!, {
                      releaseDailyBps: parseBpsInput(settlementInputs.dailyBps),
                      releaseImmediateBurnBps: parseBpsInput(settlementInputs.immBurnBps),
                      releaseSecondaryBurnBps: parseBpsInput(settlementInputs.secBurnBps),
                      releaseStaticBps: parseBpsInput(settlementInputs.staticBps),
                      releaseDynamicBps: parseBpsInput(settlementInputs.dynamicBps),
                      rewardCapBps: parseBpsInput(settlementInputs.capBps),
                    });
                  }, lang === "zh" ? "分配比例已更新。" : "Reward config updated.")} disabled={actionKey !== ""}>
                  {actionKey === "update-reward-cfg" ? t.loading : t.saveParam}
                </button>
              </div>
            </Card>

            <Card title={lang === "zh" ? "手动结算" : "Manual Settlement"} hint={lang === "zh" ? "执行各类结算操作" : "Execute settlement operations"} className="grid-full">
              <ParamGuide title={guideLabel} items={paramGuides.manualSettle} />
              <label className="field">{lang === "zh" ? "每日结算-参与者地址(逗号分隔)" : "Daily - Participants (comma-separated)"}
                <input value={settlementInputs.settleDailyAddrs} onChange={e => setSettlementInputs(p => ({ ...p, settleDailyAddrs: e.target.value }))} placeholder="0x...,0x..." />
              </label>
              <div className="actions admin-actions-tight">
                <button className="primary-btn" type="button"
                  onClick={() => void executeAction("settle-daily", async () => {
                    const addrs = settlementInputs.settleDailyAddrs.split(",").map(s => s.trim()).filter(Boolean);
                    if (addrs.length === 0) throw new Error(lang === "zh" ? "请输入至少一个参与者地址" : "Enter at least one participant address");
                    addrs.forEach(validateAddress);
                    await settleDailyRewardsManual(provider!, addrs, parseUnits("1", 18));
                  }, lang === "zh" ? "每日结算完成。" : "Daily settlement done.")} disabled={actionKey !== ""}>
                  {actionKey === "settle-daily" ? t.loading : lang === "zh" ? "每日结算" : "Settle Daily"}
                </button>
              </div>

              <label className="field" style={{ marginTop: "12px" }}>{lang === "zh" ? "排行榜结算 - Day ID" : "Leaderboard - Day ID"}
                <input value={settlementInputs.settleLeaderDayId} onChange={e => setSettlementInputs(p => ({ ...p, settleLeaderDayId: e.target.value }))} placeholder="1" />
              </label>
              <div className="actions admin-actions-tight">
                <button className="primary-btn" type="button"
                  onClick={() => void executeAction("settle-leader", async () => {
                    await settleLeaderboard(provider!, parseNonNegativeBigInt(settlementInputs.settleLeaderDayId));
                  }, lang === "zh" ? "排行榜结算完成。" : "Leaderboard settled.")} disabled={actionKey !== ""}>
                  {actionKey === "settle-leader" ? t.loading : lang === "zh" ? "排行榜结算" : "Settle Leaderboard"}
                </button>
              </div>

              <AdminSettlementPanel
                provider={provider}
                lang={lang}
                actionKey={actionKey}
                executeAction={executeAction}
                usdtDecimals={18}
                loadingLabel={t.loading}
              />

              <div style={{ marginTop: "16px", fontSize: "12px", color: "#a00" }}>
                {lang === "zh"
                  ? "⚠ 节点/超级节点购买剩余资金地址在下方维护，已配置时按地址组等额分发。"
                  : "⚠ Maintain node/super-node residual recipients below. Once configured, residual purchase funds are split evenly across those addresses."}
              </div>

              <div style={{ marginTop: "12px", padding: "12px", border: "1px solid rgba(45,119,119,0.28)", borderRadius: "10px" }}>
                <div style={{ fontWeight: 600, marginBottom: "6px" }}>
                  {lang === "zh" ? "节点购买剩余资金接收地址" : "Node Purchase Residual Recipients"}
                </div>
                <div style={{ fontSize: "12px", color: "#8aa0c8", marginBottom: "8px" }}>
                  {lang === "zh"
                    ? "购买节点扣除推荐奖励后的剩余资金，会等额分发到以下地址；未配置时回退到平台池地址。"
                    : "After node referral rewards are paid, the remaining amount is split evenly across the addresses below; if unset, it falls back to the platform recipient."}
                </div>
                {nodeResidualRows.map((row, index) => (
                  <div key={row.id} style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: index + 1 === nodeResidualRows.length ? "0" : "8px" }}>
                    <input
                      style={{ flex: 1 }}
                      value={row.value}
                      onChange={(e) => updateRecipientRows(setNodeResidualRows, row.id, e.target.value)}
                      placeholder="0x..."
                    />
                    <button className="ghost-btn" type="button" onClick={() => removeRecipientRow(setNodeResidualRows, row.id)} disabled={actionKey !== ""}>
                      {lang === "zh" ? "删除" : "Remove"}
                    </button>
                  </div>
                ))}
                <div className="actions admin-actions-tight" style={{ marginTop: "10px", display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  <button className="ghost-btn" type="button" onClick={() => addRecipientRow(setNodeResidualRows)} disabled={actionKey !== ""}>
                    {lang === "zh" ? "➕ 添加地址" : "➕ Add Address"}
                  </button>
                  <button className="primary-btn" type="button"
                    onClick={() => void executeAction("save-node-residual", async () => {
                      const recipients = collectRecipientRows(nodeResidualRows, lang === "zh" ? "请至少配置一个节点地址" : "Add at least one node recipient");
                      await setNodePurchaseResidualRecipients(provider!, recipients);
                    }, lang === "zh" ? "节点购买剩余资金地址已保存。" : "Node residual recipients saved.")}
                    disabled={actionKey !== ""}>
                    {actionKey === "save-node-residual" ? t.loading : lang === "zh" ? "保存节点地址配置" : "Save Node Recipients"}
                  </button>
                </div>
              </div>

              <div style={{ marginTop: "12px", padding: "12px", border: "1px solid rgba(45,119,119,0.28)", borderRadius: "10px" }}>
                <div style={{ fontWeight: 600, marginBottom: "6px" }}>
                  {lang === "zh" ? "超级节点购买剩余资金接收地址" : "Super-Node Purchase Residual Recipients"}
                </div>
                <div style={{ fontSize: "12px", color: "#8aa0c8", marginBottom: "8px" }}>
                  {lang === "zh"
                    ? "购买超级节点扣除推荐奖励后的剩余资金，会等额分发到以下地址；未配置时回退到平台池地址。"
                    : "After super-node referral rewards are paid, the remaining amount is split evenly across the addresses below; if unset, it falls back to the platform recipient."}
                </div>
                {superResidualRows.map((row, index) => (
                  <div key={row.id} style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: index + 1 === superResidualRows.length ? "0" : "8px" }}>
                    <input
                      style={{ flex: 1 }}
                      value={row.value}
                      onChange={(e) => updateRecipientRows(setSuperResidualRows, row.id, e.target.value)}
                      placeholder="0x..."
                    />
                    <button className="ghost-btn" type="button" onClick={() => removeRecipientRow(setSuperResidualRows, row.id)} disabled={actionKey !== ""}>
                      {lang === "zh" ? "删除" : "Remove"}
                    </button>
                  </div>
                ))}
                <div className="actions admin-actions-tight" style={{ marginTop: "10px", display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  <button className="ghost-btn" type="button" onClick={() => addRecipientRow(setSuperResidualRows)} disabled={actionKey !== ""}>
                    {lang === "zh" ? "➕ 添加地址" : "➕ Add Address"}
                  </button>
                  <button className="primary-btn" type="button"
                    onClick={() => void executeAction("save-super-residual", async () => {
                      const recipients = collectRecipientRows(superResidualRows, lang === "zh" ? "请至少配置一个超级节点地址" : "Add at least one super-node recipient");
                      await setSuperNodePurchaseResidualRecipients(provider!, recipients);
                    }, lang === "zh" ? "超级节点购买剩余资金地址已保存。" : "Super-node residual recipients saved.")}
                    disabled={actionKey !== ""}>
                    {actionKey === "save-super-residual" ? t.loading : lang === "zh" ? "保存超级节点地址配置" : "Save Super Recipients"}
                  </button>
                </div>
              </div>
            </Card>

            <Card title={lang === "zh" ? "身份市场 / 权重 / 提取" : "Identity Market / Weight / Withdraw"} hint={lang === "zh" ? "设置身份市场合约、奖励权重和提取 USDT" : "Set identity market, reward weight, and withdraw USDT"}>
              <ParamGuide title={guideLabel} items={paramGuides.identityWeightWithdraw} />
              <label className="field">{lang === "zh" ? "身份市场地址" : "Identity Market Address"}
                <input value={settlementInputs.identityMarket} onChange={e => setSettlementInputs(p => ({ ...p, identityMarket: e.target.value }))} placeholder={identityMarket || "0x..."} />
              </label>
              <div className="actions admin-actions-tight">
                <button className="ghost-btn" type="button"
                  onClick={() => void executeAction("set-id-market", async () => {
                    validateAddress(settlementInputs.identityMarket);
                    await setIdentityMarket(provider!, settlementInputs.identityMarket.trim());
                  }, lang === "zh" ? "身份市场已更新。" : "Identity market updated.")} disabled={actionKey !== ""}>
                  {actionKey === "set-id-market" ? t.loading : t.saveParam}
                </button>
              </div>

              <label className="field" style={{ marginTop: "12px" }}>{lang === "zh" ? "地址" : "Address"}
                <input value={settlementInputs.rewardWeightAddr} onChange={e => setSettlementInputs(p => ({ ...p, rewardWeightAddr: e.target.value }))} placeholder="0x..." />
              </label>
              <label className="field">{lang === "zh" ? "权重值" : "Weight"}
                <input value={settlementInputs.rewardWeight} onChange={e => setSettlementInputs(p => ({ ...p, rewardWeight: e.target.value }))} placeholder="100" />
              </label>
              <div className="actions admin-actions-tight">
                <button className="ghost-btn" type="button"
                  onClick={() => void executeAction("set-weight", async () => {
                    validateAddress(settlementInputs.rewardWeightAddr);
                    await setRewardWeight(provider!, settlementInputs.rewardWeightAddr.trim(), parseNonNegativeBigInt(settlementInputs.rewardWeight));
                  }, lang === "zh" ? "权重已更新。" : "Weight updated.")} disabled={actionKey !== ""}>
                  {actionKey === "set-weight" ? t.loading : lang === "zh" ? "设置权重" : "Set Weight"}
                </button>
              </div>

              <label className="field" style={{ marginTop: "12px" }}>{lang === "zh" ? "提取到地址" : "Withdraw to"}
                <input value={settlementInputs.withdrawTo} onChange={e => setSettlementInputs(p => ({ ...p, withdrawTo: e.target.value }))} placeholder="0x..." />
              </label>
              <label className="field">{lang === "zh" ? "提取 USDT 数量" : "Withdraw Amount (USDT)"}
                <input value={settlementInputs.withdrawAmount} onChange={e => setSettlementInputs(p => ({ ...p, withdrawAmount: e.target.value }))} placeholder="0" />
              </label>
              <div className="actions admin-actions-tight">
                <button className="primary-btn" type="button" style={{ background: "var(--color-warning, #f59e0b)" }}
                  onClick={() => void executeAction("withdraw-usdt", async () => {
                    validateAddress(settlementInputs.withdrawTo);
                    await withdrawCoreUSDT(provider!, settlementInputs.withdrawTo.trim(), parsePositiveUsdt(settlementInputs.withdrawAmount));
                  }, lang === "zh" ? "USDT 已提取。" : "USDT withdrawn.")} disabled={actionKey !== ""}>
                  {actionKey === "withdraw-usdt" ? t.loading : lang === "zh" ? "提取 USDT" : "Withdraw"}
                </button>
              </div>
            </Card>

            <Card title={lang === "zh" ? "🏦 链上资金托管（核心合约国库）" : "🏦 Core Contract Treasury"} hint={lang === "zh" ? "查看并管理合约代持的 USDT / LIGHT；按池分账" : "Inspect & manage USDT / LIGHT custodied by the contract, per-pool ledger"}>
              <div className="actions admin-actions-tight" style={{ marginBottom: 10 }}>
                <button className="ghost-btn" type="button" disabled={treasuryLoading}
                  onClick={() => void (async () => {
                    if (!provider) return;
                    setTreasuryLoading(true);
                    try {
                      const s = await getCoreTreasuryStatus(provider);
                      setTreasuryStatus(s);
                    } catch (e) {
                      const msg = parseContractError(e, lang);
                      setLocalStatus(msg);
                      onStatusChange(msg);
                    } finally {
                      setTreasuryLoading(false);
                    }
                  })()}>
                  {treasuryLoading ? t.loading : (lang === "zh" ? "刷新国库状态" : "Refresh Treasury")}
                </button>
              </div>
              {treasuryStatus && (
                <div style={{ fontSize: 12, lineHeight: 1.7, background: "var(--color-surface-2, #f7f7fb)", padding: 10, borderRadius: 6, marginBottom: 10 }}>
                  <div><strong>USDT:</strong> {formatUsdt(treasuryStatus.usdtBalance)} · {lang === "zh" ? "池锁定" : "reserved"} {formatUsdt(treasuryStatus.reservedForPools)} · {lang === "zh" ? "自由余额" : "free"} <strong style={{ color: "#15803d" }}>{formatUsdt(treasuryStatus.freeUSDT)}</strong></div>
                  <div style={{ marginTop: 4 }}>
                    {(["Liquidity", "Referral", "SuperNode", "Node", "Platform", "Leaderboard", "Contract"] as const).map((name, i) => (
                      <span key={name} style={{ marginRight: 12 }}>
                        [{i}] {name}: <strong>{formatUsdt(treasuryStatus.poolAccumulated[i] ?? 0n)}</strong>
                      </span>
                    ))}
                  </div>
                  <div style={{ marginTop: 6 }}><strong>LIGHT:</strong> {formatUnits(treasuryStatus.lightBalance, 18)} · {lang === "zh" ? "每日奖励锁定" : "daily reserve"} {formatUnits(treasuryStatus.lightRewardReserve, 18)} · {lang === "zh" ? "自由" : "free"} <strong style={{ color: "#15803d" }}>{formatUnits(treasuryStatus.freeLight, 18)}</strong></div>
                </div>
              )}

              <div style={{ borderTop: "1px dashed #cbd5e1", paddingTop: 10, marginTop: 6 }}>
                <div style={{ fontSize: 12, color: "#475569", marginBottom: 6 }}>
                  {lang === "zh" ? "① 从指定池账本（poolAccumulated）手动发放 — 不影响池外自由余额" : "① Manually disburse from a pool ledger (poolAccumulated)"}
                </div>
                <div className="admin-form-grid">
                  <label className="field">{lang === "zh" ? "池类型" : "Pool"}
                    <select value={settlementInputs.treasuryPoolType} onChange={e => setSettlementInputs(p => ({ ...p, treasuryPoolType: e.target.value }))}>
                      <option value="0">0 Liquidity</option>
                      <option value="1">1 Referral</option>
                      <option value="2">2 SuperNode</option>
                      <option value="3">3 Node</option>
                      <option value="4">4 Platform</option>
                      <option value="5">5 Leaderboard</option>
                      <option value="6">6 Contract</option>
                    </select>
                  </label>
                  <label className="field">{lang === "zh" ? "收款地址" : "To"}
                    <input value={settlementInputs.treasuryPoolTo} onChange={e => setSettlementInputs(p => ({ ...p, treasuryPoolTo: e.target.value }))} placeholder="0x..." />
                  </label>
                  <label className="field">{lang === "zh" ? "数量 (USDT)" : "Amount (USDT)"}
                    <input value={settlementInputs.treasuryPoolAmt} onChange={e => setSettlementInputs(p => ({ ...p, treasuryPoolAmt: e.target.value }))} placeholder="0" />
                  </label>
                </div>
                <div className="actions admin-actions-tight">
                  <button className="ghost-btn" type="button"
                    onClick={() => void executeAction("withdraw-pool", async () => {
                      validateAddress(settlementInputs.treasuryPoolTo);
                      const pt = Number(settlementInputs.treasuryPoolType);
                      if (!Number.isInteger(pt) || pt < 0 || pt > 6) throw new Error(lang === "zh" ? "池类型须为 0-6" : "Pool type must be 0-6");
                      await withdrawCoreAccumulatedPool(provider!, pt, settlementInputs.treasuryPoolTo.trim(), parsePositiveUsdt(settlementInputs.treasuryPoolAmt));
                    }, lang === "zh" ? "池账本发放完成。" : "Pool ledger disbursed.")} disabled={actionKey !== ""}>
                    {actionKey === "withdraw-pool" ? t.loading : (lang === "zh" ? "从池账本发放" : "Disburse from pool")}
                  </button>
                </div>
              </div>

              <div style={{ borderTop: "1px dashed #cbd5e1", paddingTop: 10, marginTop: 10 }}>
                <div style={{ fontSize: 12, color: "#475569", marginBottom: 6 }}>
                  {lang === "zh" ? "② LIGHT 代币提取 — 不会动用 rewardPoolBalance" : "② Withdraw LIGHT (guarded by rewardPoolBalance)"}
                </div>
                <div className="admin-form-grid">
                  <label className="field">{lang === "zh" ? "收款地址" : "To"}
                    <input value={settlementInputs.treasuryLightTo} onChange={e => setSettlementInputs(p => ({ ...p, treasuryLightTo: e.target.value }))} placeholder="0x..." />
                  </label>
                  <label className="field">{lang === "zh" ? "数量 (LIGHT)" : "Amount (LIGHT)"}
                    <input value={settlementInputs.treasuryLightAmt} onChange={e => setSettlementInputs(p => ({ ...p, treasuryLightAmt: e.target.value }))} placeholder="0" />
                  </label>
                </div>
                <div className="actions admin-actions-tight">
                  <button className="ghost-btn" type="button"
                    onClick={() => void executeAction("withdraw-light", async () => {
                      validateAddress(settlementInputs.treasuryLightTo);
                      await withdrawCoreLight(provider!, settlementInputs.treasuryLightTo.trim(), parsePositiveAmount(settlementInputs.treasuryLightAmt));
                    }, lang === "zh" ? "LIGHT 已提取。" : "LIGHT withdrawn.")} disabled={actionKey !== ""}>
                    {actionKey === "withdraw-light" ? t.loading : (lang === "zh" ? "提取 LIGHT" : "Withdraw LIGHT")}
                  </button>
                </div>
              </div>

              <div style={{ borderTop: "1px solid #ef4444", paddingTop: 10, marginTop: 10, background: "#fef2f2", padding: 10, borderRadius: 6 }}>
                <div style={{ fontSize: 12, color: "#991b1b", marginBottom: 6, fontWeight: 600 }}>
                  ⚠ {lang === "zh" ? "③ 紧急提取 — 需合约已 Paused，可穿透池/奖励锁定" : "③ Emergency withdraw — requires paused, bypasses ledger guards"}
                </div>
                <div className="actions admin-actions-tight">
                  <button className="ghost-btn" type="button" style={{ borderColor: "#ef4444", color: "#b91c1c" }}
                    onClick={() => void executeAction("emerg-usdt", async () => {
                      validateAddress(settlementInputs.withdrawTo);
                      if (!window.confirm(t.confirmDangerous)) throw new Error(lang === "zh" ? "用户已取消" : "Cancelled by user");
                      await emergencyWithdrawCoreUSDT(provider!, settlementInputs.withdrawTo.trim(), parsePositiveUsdt(settlementInputs.withdrawAmount));
                    }, lang === "zh" ? "紧急 USDT 已提取。" : "Emergency USDT withdrawn.")} disabled={actionKey !== ""}>
                    {actionKey === "emerg-usdt" ? t.loading : (lang === "zh" ? "紧急提取 USDT（使用上方提取框参数）" : "Emergency USDT (uses form above)")}
                  </button>
                  <button className="ghost-btn" type="button" style={{ borderColor: "#ef4444", color: "#b91c1c" }}
                    onClick={() => void executeAction("emerg-light", async () => {
                      validateAddress(settlementInputs.treasuryLightTo);
                      if (!window.confirm(t.confirmDangerous)) throw new Error(lang === "zh" ? "用户已取消" : "Cancelled by user");
                      await emergencyWithdrawCoreLight(provider!, settlementInputs.treasuryLightTo.trim(), parsePositiveAmount(settlementInputs.treasuryLightAmt));
                    }, lang === "zh" ? "紧急 LIGHT 已提取。" : "Emergency LIGHT withdrawn.")} disabled={actionKey !== ""}>
                    {actionKey === "emerg-light" ? t.loading : (lang === "zh" ? "紧急提取 LIGHT" : "Emergency LIGHT")}
                  </button>
                </div>
              </div>
            </Card>

            <Card title={lang === "zh" ? "OTC 低价清理" : "OTC Cleanup"} hint={lang === "zh" ? "批量撤销 OTC 上的低价挂单" : "Batch cancel low-price OTC orders"}>
              <ParamGuide title={guideLabel} items={paramGuides.cleanup} />
              <div className="admin-form-grid">
                <label className="field">{lang === "zh" ? "身份类型" : "Role"} (1=Node, 2=SuperNode)
                  <input value={settlementInputs.cleanupRole} onChange={e => setSettlementInputs(p => ({ ...p, cleanupRole: e.target.value }))} />
                </label>
                <label className="field">{lang === "zh" ? "最大撤销数" : "Max Cancels"}
                  <input value={settlementInputs.cleanupMax} onChange={e => setSettlementInputs(p => ({ ...p, cleanupMax: e.target.value }))} />
                </label>
              </div>
              <div className="actions">
                <button className="ghost-btn" type="button"
                  onClick={() => void executeAction("cleanup-otc", async () => {
                    const role = Number(settlementInputs.cleanupRole);
                    if (role !== 1 && role !== 2) throw new Error(t.invalidCleanupRole);
                    const maxN = Number(settlementInputs.cleanupMax);
                    if (!Number.isInteger(maxN) || maxN < 1) throw new Error(t.invalidCleanupMax);
                    await cleanupLowerOrders(provider!, role, maxN);
                  }, lang === "zh" ? "低价清理完成。" : "Cleanup done.")} disabled={actionKey !== ""}>
                  {actionKey === "cleanup-otc" ? t.loading : lang === "zh" ? "执行清理" : "Run Cleanup"}
                </button>
              </div>
            </Card>
          </section>
        )}

        {adminTab === "settlement" && !canManageSystem && canManageCleanup && (
          <section className="grid">
            <Card title={lang === "zh" ? "OTC 低价清理" : "OTC Cleanup"} hint={lang === "zh" ? "批量撤销 OTC 上的低价挂单" : "Batch cancel low-price OTC orders"}>
              <ParamGuide title={guideLabel} items={paramGuides.cleanup} />
              <div className="admin-form-grid">
                <label className="field">{lang === "zh" ? "身份类型" : "Role"} (1=Node, 2=SuperNode)
                  <input value={settlementInputs.cleanupRole} onChange={e => setSettlementInputs(p => ({ ...p, cleanupRole: e.target.value }))} />
                </label>
                <label className="field">{lang === "zh" ? "最大撤销数" : "Max Cancels"}
                  <input value={settlementInputs.cleanupMax} onChange={e => setSettlementInputs(p => ({ ...p, cleanupMax: e.target.value }))} />
                </label>
              </div>
              <div className="actions">
                <button className="ghost-btn" type="button"
                  onClick={() => void executeAction("cleanup-otc", async () => {
                    const role = Number(settlementInputs.cleanupRole);
                    if (role !== 1 && role !== 2) throw new Error(t.invalidCleanupRole);
                    const maxN = Number(settlementInputs.cleanupMax);
                    if (!Number.isInteger(maxN) || maxN < 1) throw new Error(t.invalidCleanupMax);
                    await cleanupLowerOrders(provider!, role, maxN);
                  }, lang === "zh" ? "低价清理完成。" : "Cleanup done.")} disabled={actionKey !== ""}>
                  {actionKey === "cleanup-otc" ? t.loading : lang === "zh" ? "执行清理" : "Run Cleanup"}
                </button>
              </div>
            </Card>
          </section>
        )}

        {/* ════ 一级市场 (PrimarySwapController) ════ */}
        {adminTab === "primary" && canManageSystem && (
          <section className="grid">
            <Card title={lang === "zh" ? "一级市场概况" : "Primary Swap Overview"} hint={lang === "zh" ? "PrimarySwapController 当前配置" : "Current PrimarySwapController config"}>
              {primaryConfig ? (
                <>
                  <KVRow label="Buy Fee BPS" value={String(primaryConfig.buyFeeBps)} />
                  <KVRow label="Sell Fee BPS" value={String(primaryConfig.sellFeeBps)} />
                  <KVRow label="SuperNode Fee BPS" value={String(primaryConfig.superNodeFeeBps)} />
                  <KVRow label="NodePool Fee BPS" value={String(primaryConfig.nodePoolFeeBps)} />
                  <KVRow label="Contract Fee BPS" value={String(primaryConfig.platformFeeBps)} />
                  <KVRow label="Sell Burn BPS" value={String(primaryConfig.sellBurnBps)} />
                  <KVRow label="Sell Contract ICO BPS" value={String(primaryConfig.sellPlatformIcoBps)} />
                  <KVRow label="Sell Liquidity ICO BPS" value={String(primaryConfig.sellLiquidityIcoBps)} />
                  <KVRow label={lang === "zh" ? "卖出 USDT 已启用" : "Sell USDT Enabled"} value={primaryConfig.sellUsdtEnabled ? "Yes" : "No"} />
                  <KVRow label={lang === "zh" ? "可启用卖出" : "Can Enable Sell"} value={primaryConfig.canEnableSell ? "Yes" : "No"} />
                  <KVRow label="Min USDT Reserve" value={formatUnits(primaryConfig.minUsdtReserve, 18)} />
                  <KVRow label="Min ICO Holders" value={String(primaryConfig.minIcoHolderCount)} />
                  <KVRow label="Reported Holders" value={String(primaryConfig.reportedIcoHolderCount)} />
                  <KVRow label="SuperNode Recipient" value={primaryConfig.superNodeFeeRecipient || "-"} />
                  <KVRow label="NodePool Recipient" value={primaryConfig.nodePoolFeeRecipient || "-"} />
                  <KVRow label="Contract Recipient" value={primaryConfig.platformRecipient || "-"} />
                  <KVRow label="Pair" value={primaryConfig.pair || "-"} />
                </>
              ) : <p>{t.loading}</p>}
            </Card>

            <Card title={lang === "zh" ? "买入手续费" : "Buy Fee Config"} hint="updateBuyFeeConfig">
              <ParamGuide title={guideLabel} items={paramGuides.primaryBuy} />
              <div className="admin-form-grid">
                <label className="field">Buy BPS<input value={primaryInputs.buyBps} onChange={e => setPrimaryInputs(p => ({ ...p, buyBps: e.target.value }))} /></label>
                <label className="field">SuperNode BPS<input value={primaryInputs.superBps} onChange={e => setPrimaryInputs(p => ({ ...p, superBps: e.target.value }))} /></label>
                <label className="field">NodePool BPS<input value={primaryInputs.nodeBps} onChange={e => setPrimaryInputs(p => ({ ...p, nodeBps: e.target.value }))} /></label>
                <label className="field">Contract BPS<input value={primaryInputs.platBps} onChange={e => setPrimaryInputs(p => ({ ...p, platBps: e.target.value }))} /></label>
              </div>
              <div className="actions">
                <button className="primary-btn" type="button"
                  onClick={() => void executeAction("pri-buy-fee", async () => {
                    await updatePrimaryBuyFeeConfig(provider!, parseBpsInput(primaryInputs.buyBps), parseBpsInput(primaryInputs.superBps), parseBpsInput(primaryInputs.nodeBps), parseBpsInput(primaryInputs.platBps));
                  }, lang === "zh" ? "买入手续费已更新。" : "Buy fee updated.")} disabled={actionKey !== ""}>
                  {actionKey === "pri-buy-fee" ? t.loading : t.saveParam}
                </button>
              </div>
            </Card>

            <Card title={lang === "zh" ? "卖出配置" : "Sell Config"} hint="updateSellConfig">
              <ParamGuide title={guideLabel} items={paramGuides.primarySell} />
              <div className="admin-form-grid">
                <label className="field">Sell BPS<input value={primaryInputs.sellBps} onChange={e => setPrimaryInputs(p => ({ ...p, sellBps: e.target.value }))} /></label>
                <label className="field">Burn BPS<input value={primaryInputs.burnBps} onChange={e => setPrimaryInputs(p => ({ ...p, burnBps: e.target.value }))} /></label>
                <label className="field">Contract ICO BPS<input value={primaryInputs.platIcoBps} onChange={e => setPrimaryInputs(p => ({ ...p, platIcoBps: e.target.value }))} /></label>
                <label className="field">Liquidity ICO BPS<input value={primaryInputs.liqIcoBps} onChange={e => setPrimaryInputs(p => ({ ...p, liqIcoBps: e.target.value }))} /></label>
              </div>
              <div className="actions">
                <button className="primary-btn" type="button"
                  onClick={() => void executeAction("pri-sell-cfg", async () => {
                    await updatePrimarySellConfig(provider!, parseBpsInput(primaryInputs.sellBps), parseBpsInput(primaryInputs.burnBps), parseBpsInput(primaryInputs.platIcoBps), parseBpsInput(primaryInputs.liqIcoBps));
                  }, lang === "zh" ? "卖出配置已更新。" : "Sell config updated.")} disabled={actionKey !== ""}>
                  {actionKey === "pri-sell-cfg" ? t.loading : t.saveParam}
                </button>
              </div>
            </Card>

            <Card title={lang === "zh" ? "接收地址" : "Fee Recipients"} hint={lang === "zh" ? "updateRecipients（仅 USDT→ICO 兑换手续费，不影响购买算力）" : "updateRecipients (swap fee only, NOT machine purchase)"}>
              <div className="warning-banner" style={{ padding: "8px 12px", marginBottom: 12, background: "rgba(255,176,32,0.12)", border: "1px solid rgba(255,176,32,0.4)", borderRadius: 6, fontSize: 12, lineHeight: 1.5 }}>
                {lang === "zh"
                  ? "⚠ 此处仅影响 USDT→ICO 兑换时的手续费分发。若要修改购买算力/节点的 Platform/SuperNode/Node 接收地址，请切换到『资金池』页。"
                  : "⚠ Only affects fee recipients on USDT→ICO swaps. To change machine/node purchase recipients, use the Pools tab."}
              </div>
              <ParamGuide title={guideLabel} items={paramGuides.primaryRecipients} />
              <label className="field">SuperNode Recipient<input value={primaryInputs.superRecip} onChange={e => setPrimaryInputs(p => ({ ...p, superRecip: e.target.value }))} /></label>
              <label className="field">NodePool Recipient<input value={primaryInputs.nodeRecip} onChange={e => setPrimaryInputs(p => ({ ...p, nodeRecip: e.target.value }))} /></label>
              <label className="field">Contract Recipient<input value={primaryInputs.platRecip} onChange={e => setPrimaryInputs(p => ({ ...p, platRecip: e.target.value }))} /></label>
              <div className="actions">
                <button className="primary-btn" type="button"
                  onClick={() => void executeAction("pri-recip", async () => {
                    validateAddress(primaryInputs.superRecip); validateAddress(primaryInputs.nodeRecip); validateAddress(primaryInputs.platRecip);
                    await updatePrimaryRecipients(provider!, primaryInputs.superRecip.trim(), primaryInputs.nodeRecip.trim(), primaryInputs.platRecip.trim());
                  }, lang === "zh" ? "接收地址已更新。" : "Recipients updated.")} disabled={actionKey !== ""}>
                  {actionKey === "pri-recip" ? t.loading : t.saveParam}
                </button>
              </div>
            </Card>

            <Card title={lang === "zh" ? "阈值 / 持有人 / Pair" : "Thresholds / Holders / Pair"} hint={lang === "zh" ? "开启卖出的前置条件" : "Prerequisites for enabling sell"}>
              <ParamGuide title={guideLabel} items={paramGuides.primaryThreshold} />
              <div className="admin-form-grid">
                <label className="field">{lang === "zh" ? "最低 USDT 储备" : "Min USDT Reserve"}<input value={primaryInputs.minReserve} onChange={e => setPrimaryInputs(p => ({ ...p, minReserve: e.target.value }))} /></label>
                <label className="field">{lang === "zh" ? "最低持有人数" : "Min ICO Holders"}<input value={primaryInputs.minHolders} onChange={e => setPrimaryInputs(p => ({ ...p, minHolders: e.target.value }))} /></label>
              </div>
              <div className="actions admin-actions-tight">
                <button className="ghost-btn" type="button"
                  onClick={() => void executeAction("pri-thresholds", async () => {
                    await updatePrimaryThresholds(provider!, parseUnits(((primaryInputs.minReserve ?? "").trim() || "0"), 18), parseNonNegativeBigInt(primaryInputs.minHolders));
                  }, lang === "zh" ? "阈值已更新。" : "Thresholds updated.")} disabled={actionKey !== ""}>
                  {actionKey === "pri-thresholds" ? t.loading : t.saveParam}
                </button>
              </div>

              <label className="field" style={{ marginTop: "12px" }}>{lang === "zh" ? "上报持有人数" : "Report Holder Count"}
                <input value={primaryInputs.holderCount} onChange={e => setPrimaryInputs(p => ({ ...p, holderCount: e.target.value }))} />
              </label>
              <div className="actions admin-actions-tight">
                <button className="ghost-btn" type="button"
                  onClick={() => void executeAction("pri-holder-count", async () => {
                    await reportIcoHolderCount(provider!, parseNonNegativeBigInt(primaryInputs.holderCount));
                  }, lang === "zh" ? "已上报持有人数。" : "Holder count reported.")} disabled={actionKey !== ""}>
                  {actionKey === "pri-holder-count" ? t.loading : lang === "zh" ? "上报" : "Report"}
                </button>
              </div>

              <label className="field" style={{ marginTop: "12px" }}>{lang === "zh" ? "Pair 合约地址" : "Pair Address"}
                <input value={primaryInputs.pairAddr} onChange={e => setPrimaryInputs(p => ({ ...p, pairAddr: e.target.value }))} />
              </label>
              <div className="actions admin-actions-tight">
                <button className="ghost-btn" type="button"
                  onClick={() => void executeAction("pri-pair", async () => {
                    validateAddress(primaryInputs.pairAddr);
                    await updatePrimaryPair(provider!, primaryInputs.pairAddr.trim());
                  }, lang === "zh" ? "Pair 已更新。" : "Pair updated.")} disabled={actionKey !== ""}>
                  {actionKey === "pri-pair" ? t.loading : t.saveParam}
                </button>
              </div>
            </Card>

            <Card title={lang === "zh" ? "卖出开关 / 资金提取" : "Sell Toggle / Treasury Withdraw"} hint={lang === "zh" ? "启用/禁用 USDT 卖出，或提取资金" : "Enable/disable sell USDT or withdraw treasury"}>
              <ParamGuide title={guideLabel} items={paramGuides.primaryWithdraw} />
              <div className="actions" style={{ marginBottom: "16px" }}>
                <button className={primaryConfig?.sellUsdtEnabled ? "ghost-btn" : "primary-btn"} type="button"
                  onClick={() => {
                    const next = !(primaryConfig?.sellUsdtEnabled ?? false);
                    void executeAction("pri-force-sell-toggle", () => forceSetSellEnabled(provider!, next), next ? (lang === "zh" ? "卖出已启用。" : "Sell enabled.") : (lang === "zh" ? "卖出已禁用。" : "Sell disabled."));
                  }}
                  disabled={actionKey !== ""}>
                  {actionKey === "pri-force-sell-toggle" ? t.loading : primaryConfig?.sellUsdtEnabled ? (lang === "zh" ? "关闭卖出" : "Disable Sell") : (lang === "zh" ? "开启卖出" : "Enable Sell")}
                </button>
              </div>
              <label className="field">{lang === "zh" ? "提取 Token 地址" : "Token Address"}<input value={primaryInputs.treasuryToken} onChange={e => setPrimaryInputs(p => ({ ...p, treasuryToken: e.target.value }))} placeholder="0x..." /></label>
              <label className="field">{lang === "zh" ? "提取到" : "Withdraw to"}<input value={primaryInputs.treasuryTo} onChange={e => setPrimaryInputs(p => ({ ...p, treasuryTo: e.target.value }))} placeholder="0x..." /></label>
              <label className="field">{lang === "zh" ? "数量 (wei)" : "Amount (wei)"}<input value={primaryInputs.treasuryAmount} onChange={e => setPrimaryInputs(p => ({ ...p, treasuryAmount: e.target.value }))} /></label>
              <div className="actions">
                <button className="primary-btn" type="button" style={{ background: "var(--color-warning, #f59e0b)" }}
                  onClick={() => void executeAction("pri-withdraw", async () => {
                    validateAddress(primaryInputs.treasuryToken); validateAddress(primaryInputs.treasuryTo);
                    await withdrawPrimaryTreasury(provider!, primaryInputs.treasuryToken.trim(), primaryInputs.treasuryTo.trim(), parsePositiveWei(primaryInputs.treasuryAmount));
                  }, lang === "zh" ? "资金已提取。" : "Treasury withdrawn.")} disabled={actionKey !== ""}>
                  {actionKey === "pri-withdraw" ? t.loading : lang === "zh" ? "提取" : "Withdraw"}
                </button>
              </div>
            </Card>

            {/* P1: Contract pool read-only stats */}
            <Card title={lang === "zh" ? "契约池累计 (只读)" : "Contract Pool Accumulated (read-only)"} hint={lang === "zh" ? "仅展示金额，不展示地址/流向" : "Amounts only; address/flow not exposed"}>
              <div className="admin-form-grid">
                <div className="field"><span>{lang === "zh" ? "USDT 累计" : "USDT total"}</span><strong>{formatUnits(contractPoolStats.usdtTotal, 18)}</strong></div>
                <div className="field"><span>{lang === "zh" ? "ICO 累计" : "ICO total"}</span><strong>{formatUnits(contractPoolStats.icoTotal, 18)}</strong></div>
              </div>
            </Card>

            {/* P3: Auto-enable + LIGHT realtime */}
            <Card title={lang === "zh" ? "自动开盘 / 实时分账" : "Auto-Open / Realtime Distribution"} hint={lang === "zh" ? "P3：达标后任意人可触发开盘；LIGHT 可切换实时" : "P3: anyone can trigger auto-open once thresholds met; LIGHT realtime toggle"}>
              <div className="actions" style={{ marginBottom: "12px" }}>
                <button className="primary-btn" type="button"
                  disabled={actionKey !== "" || !!primaryConfig?.sellUsdtEnabled || !primaryConfig?.canEnableSell}
                  onClick={() => void executeAction("pri-auto-enable", () => tryAutoEnableSellUsdt(provider!), lang === "zh" ? "已自动开盘。" : "Auto-enabled.")}
                >
                  {actionKey === "pri-auto-enable" ? t.loading : (lang === "zh" ? "自动开盘 (任意人)" : "Auto-Enable (anyone)")}
                </button>
                <span style={{ marginLeft: 12, fontSize: 12, opacity: 0.7 }}>
                  {primaryConfig?.sellUsdtEnabled
                    ? (lang === "zh" ? "已开盘" : "enabled")
                    : primaryConfig?.canEnableSell
                      ? (lang === "zh" ? "阈值已达,可触发" : "ready")
                      : (lang === "zh" ? "未达阈值" : "threshold not met")}
                </span>
              </div>
              <div className="actions">
                <button className={lightRealtime ? "ghost-btn" : "primary-btn"} type="button"
                  disabled={actionKey !== ""}
                  onClick={() => {
                    const next = !lightRealtime;
                    void executeAction("pri-light-realtime", async () => {
                      await setLightRealtimeDistribute(provider!, next);
                      setLightRealtimeState(next);
                    }, next ? (lang === "zh" ? "已开启 LIGHT 实时分账。" : "LIGHT realtime ON.") : (lang === "zh" ? "已关闭 LIGHT 实时分账。" : "LIGHT realtime OFF."));
                  }}>
                  {actionKey === "pri-light-realtime" ? t.loading : lightRealtime ? (lang === "zh" ? "关闭 LIGHT 实时" : "Disable LIGHT realtime") : (lang === "zh" ? "开启 LIGHT 实时" : "Enable LIGHT realtime")}
                </button>
              </div>
            </Card>

            {/* P6: Legacy USDT/ICO internal pool migration */}
            <Card title={lang === "zh" ? "Legacy USDT/ICO 池 (P6 已废弃)" : "Legacy USDT/ICO Pool (P6 deprecated)"} hint={lang === "zh" ? "USDT/ICO 已合并到主市场;此处仅用于残值迁移" : "USDT/ICO merged into primary market; for residual migration only"}>
              <div className="actions" style={{ marginBottom: "12px" }}>
                <button className={usdtIcoLegacyEnabled ? "primary-btn" : "ghost-btn"} type="button"
                  disabled={actionKey !== ""}
                  style={usdtIcoLegacyEnabled ? { background: "var(--color-warning, #f59e0b)" } : undefined}
                  onClick={() => {
                    const next = !usdtIcoLegacyEnabled;
                    void executeAction("pri-legacy-toggle", async () => {
                      await setUsdtIcoPoolEnabled(provider!, next);
                      setUsdtIcoLegacyEnabledState(next);
                    }, next ? (lang === "zh" ? "Legacy 池已启用 (慎用)。" : "Legacy pool enabled (caution).") : (lang === "zh" ? "Legacy 池已禁用。" : "Legacy pool disabled."));
                  }}>
                  {actionKey === "pri-legacy-toggle" ? t.loading : usdtIcoLegacyEnabled ? (lang === "zh" ? "禁用 Legacy 池" : "Disable Legacy") : (lang === "zh" ? "启用 Legacy 池 (仅诊断)" : "Enable Legacy (diag only)")}
                </button>
                <span style={{ marginLeft: 12, fontSize: 12, opacity: 0.7 }}>
                  {usdtIcoLegacyEnabled ? (lang === "zh" ? "已启用" : "enabled") : (lang === "zh" ? "已禁用 (默认)" : "disabled (default)")}
                </span>
              </div>
              <label className="field">{lang === "zh" ? "残值迁移到 (一次性)" : "Migrate residual to (one-shot)"}<input value={primaryInputs.migrateTo} onChange={e => setPrimaryInputs(p => ({ ...p, migrateTo: e.target.value }))} placeholder="0x..." /></label>
              <div className="actions">
                <button className="primary-btn" type="button" style={{ background: "var(--color-warning, #f59e0b)" }}
                  disabled={actionKey !== ""}
                  onClick={() => void executeAction("pri-legacy-migrate", async () => {
                    validateAddress(primaryInputs.migrateTo);
                    await migrateUsdtIcoLiquidity(provider!, primaryInputs.migrateTo.trim());
                  }, lang === "zh" ? "Legacy 池残值已迁移。" : "Legacy residual migrated.")}>
                  {actionKey === "pri-legacy-migrate" ? t.loading : (lang === "zh" ? "迁移残值" : "Migrate Residual")}
                </button>
              </div>
            </Card>

            {/* P2: Bottom-pool injection */}
            <Card title={lang === "zh" ? "底池注资 (P2)" : "Bottom-Pool Injection (P2)"} hint={lang === "zh" ? "用契约池累计资金注资 USDT/ICO 主池;自动比例 0=关闭" : "Inject USDT/ICO into AMM pool from contract-pool funds; auto-bps 0=disabled"}>
              <div className="admin-form-grid">
                <label className="field">{lang === "zh" ? "LP 接收地址 (空=平台)" : "LP recipient (empty=platform)"}<input value={primaryInputs.bottomLpRecipient} onChange={e => setPrimaryInputs(p => ({ ...p, bottomLpRecipient: e.target.value }))} placeholder="0x..." /></label>
                <label className="field">{lang === "zh" ? "自动注资比例 (bps,每笔 sell)" : "Auto-inject bps (per sell)"}<input value={primaryInputs.bottomAutoBps} onChange={e => setPrimaryInputs(p => ({ ...p, bottomAutoBps: e.target.value }))} placeholder="0" /></label>
              </div>
              <div className="actions admin-actions-tight">
                <button className="ghost-btn" type="button"
                  disabled={actionKey !== ""}
                  onClick={() => void executeAction("pri-bottom-cfg", async () => {
                    const lp = primaryInputs.bottomLpRecipient.trim() || "0x0000000000000000000000000000000000000000";
                    if (lp !== "0x0000000000000000000000000000000000000000") validateAddress(lp);
                    const bps = Number(primaryInputs.bottomAutoBps || "0");
                    if (!Number.isInteger(bps) || bps < 0 || bps > 10000) {
                      throw new Error(lang === "zh" ? "比例需 0-10000" : "bps must be 0-10000");
                    }
                    await updateBottomPoolConfig(provider!, lp, bps);
                    setBottomPoolCfgState({ lpRecipient: lp, autoInjectBps: bps });
                  }, lang === "zh" ? "底池配置已更新。" : "Bottom-pool config updated.")}>
                  {actionKey === "pri-bottom-cfg" ? t.loading : t.saveParam}
                </button>
                <span style={{ marginLeft: 12, fontSize: 12, opacity: 0.7 }}>
                  {bottomPoolCfg.autoInjectBps > 0
                    ? (lang === "zh" ? `自动: ${bottomPoolCfg.autoInjectBps} bps` : `auto: ${bottomPoolCfg.autoInjectBps} bps`)
                    : (lang === "zh" ? "自动注资关闭" : "auto disabled")}
                </span>
              </div>
              <div className="admin-form-grid" style={{ marginTop: 12 }}>
                <label className="field">{lang === "zh" ? "手动注资 USDT (wei)" : "Manual USDT (wei)"}<input value={primaryInputs.injectUsdt} onChange={e => setPrimaryInputs(p => ({ ...p, injectUsdt: e.target.value }))} /></label>
                <label className="field">{lang === "zh" ? "手动注资 ICO (wei)" : "Manual ICO (wei)"}<input value={primaryInputs.injectIco} onChange={e => setPrimaryInputs(p => ({ ...p, injectIco: e.target.value }))} /></label>
                <label className="field">{lang === "zh" ? "min USDT (滑点)" : "min USDT (slip)"}<input value={primaryInputs.injectMinUsdt} onChange={e => setPrimaryInputs(p => ({ ...p, injectMinUsdt: e.target.value }))} /></label>
                <label className="field">{lang === "zh" ? "min ICO (滑点)" : "min ICO (slip)"}<input value={primaryInputs.injectMinIco} onChange={e => setPrimaryInputs(p => ({ ...p, injectMinIco: e.target.value }))} /></label>
              </div>
              <div className="actions">
                <button className="primary-btn" type="button"
                  disabled={actionKey !== ""}
                  onClick={() => void executeAction("pri-bottom-inject", async () => {
                    const u = BigInt(primaryInputs.injectUsdt || "0");
                    const i = BigInt(primaryInputs.injectIco || "0");
                    const mU = BigInt(primaryInputs.injectMinUsdt || "0");
                    const mI = BigInt(primaryInputs.injectMinIco || "0");
                    if (u <= 0n || i <= 0n) throw new Error(lang === "zh" ? "数量必须 > 0" : "amount must be > 0");
                    await injectBottomPool(provider!, u, i, mU, mI);
                  }, lang === "zh" ? "已手动注资底池。" : "Manual injection done.")}>
                  {actionKey === "pri-bottom-inject" ? t.loading : (lang === "zh" ? "立即注资" : "Inject Now")}
                </button>
              </div>
            </Card>
          </section>
        )}

        {/* ════ 代币管理 ════ */}
        {adminTab === "token" && canManageSystem && (
          <section className="grid">
            <Card title={lang === "zh" ? "ICO Token 概况" : "ICO Token Overview"} hint={lang === "zh" ? "IncubatorToken 基本信息" : "IncubatorToken basic info"}>
              <KVRow label={lang === "zh" ? "合约地址" : "Address"} value={ICO_TOKEN_ADDRESS || "-"} />
              {icoTokenInfo ? (
                <>
                  <KVRow label={lang === "zh" ? "总供应" : "Total Supply"} value={formatUnits(icoTokenInfo.totalSupply, 18)} />
                  <KVRow label={lang === "zh" ? "总销毁" : "Total Burned"} value={formatUnits(icoTokenInfo.totalBurned, 18)} />
                  <KVRow label={lang === "zh" ? "销售钱包" : "Sale Wallet"} value={icoTokenInfo.saleAllocationWallet || "-"} />
                  <KVRow label="Owner" value={icoTokenInfo.owner || "-"} />
                </>
              ) : <p>{t.loading}</p>}
            </Card>

            <Card title={lang === "zh" ? "铸造 ICO Token" : "Mint ICO Token"} hint={lang === "zh" ? "仅 Token Owner 可调用" : "Only token owner can call"}>
              <ParamGuide title={guideLabel} items={paramGuides.tokenMintBurn} />
              <label className="field">{lang === "zh" ? "接收地址" : "Recipient"}<input value={tokenInputs.mintTo} onChange={e => setTokenInputs(p => ({ ...p, mintTo: e.target.value }))} placeholder="0x..." /></label>
              <label className="field">{lang === "zh" ? "数量" : "Amount"}<input value={tokenInputs.mintAmount} onChange={e => setTokenInputs(p => ({ ...p, mintAmount: e.target.value }))} placeholder="1000" /></label>
              <div className="actions">
                <button className="primary-btn" type="button"
                  onClick={() => void executeAction("mint-ico", async () => {
                    validateAddress(tokenInputs.mintTo);
                    await mintIcoToken(provider!, tokenInputs.mintTo.trim(), parsePositiveAmount(tokenInputs.mintAmount));
                  }, lang === "zh" ? "铸造完成。" : "Mint done.")} disabled={actionKey !== ""}>
                  {actionKey === "mint-ico" ? t.loading : lang === "zh" ? "铸造" : "Mint"}
                </button>
              </div>
            </Card>

            <Card title={lang === "zh" ? "销毁未售 Token" : "Burn Unsold"} hint={lang === "zh" ? "从销售钱包销毁指定数量" : "Burn specified amount from sale wallet"}>
              <ParamGuide title={guideLabel} items={paramGuides.tokenMintBurn} />
              <label className="field">{lang === "zh" ? "销毁数量" : "Burn Amount"}<input value={tokenInputs.burnAmount} onChange={e => setTokenInputs(p => ({ ...p, burnAmount: e.target.value }))} placeholder="1000" /></label>
              <div className="actions">
                <button className="primary-btn" type="button" style={{ background: "var(--color-error, #dc2626)" }}
                  onClick={() => void executeAction("burn-unsold", async () => {
                    if (!window.confirm(t.confirmDangerous)) throw new Error(lang === "zh" ? "用户已取消" : "Cancelled by user");
                    await burnUnsold(provider!, parsePositiveAmount(tokenInputs.burnAmount));
                  }, lang === "zh" ? "销毁完成。" : "Burn done.")} disabled={actionKey !== ""}>
                  {actionKey === "burn-unsold" ? t.loading : lang === "zh" ? "销毁" : "Burn"}
                </button>
              </div>
            </Card>

            <Card title={lang === "zh" ? "销毁执行人 / 销售钱包" : "Burn Executor / Sale Wallet"} hint={lang === "zh" ? "管理 BurnExecutor 权限和销售钱包地址" : "Manage burn executor and sale wallet"}>
              <ParamGuide title={guideLabel} items={paramGuides.tokenExecutor} />
              <label className="field">{lang === "zh" ? "Executor 地址" : "Executor Address"}<input value={tokenInputs.executorAddr} onChange={e => setTokenInputs(p => ({ ...p, executorAddr: e.target.value }))} placeholder="0x..." /></label>
              <label className="field">{lang === "zh" ? "启用 / 禁用" : "Enable / Disable"}
                <select value={tokenInputs.executorEnabled} onChange={e => setTokenInputs(p => ({ ...p, executorEnabled: e.target.value }))}>
                  <option value="true">{lang === "zh" ? "启用" : "Enable"}</option>
                  <option value="false">{lang === "zh" ? "禁用" : "Disable"}</option>
                </select>
              </label>
              <div className="actions admin-actions-tight">
                <button className="ghost-btn" type="button"
                  onClick={() => void executeAction("set-executor", async () => {
                    validateAddress(tokenInputs.executorAddr);
                    await setBurnExecutor(provider!, tokenInputs.executorAddr.trim(), tokenInputs.executorEnabled === "true");
                  }, lang === "zh" ? "Executor 已更新。" : "Executor updated.")} disabled={actionKey !== ""}>
                  {actionKey === "set-executor" ? t.loading : t.saveParam}
                </button>
              </div>

              <label className="field" style={{ marginTop: "12px" }}>{lang === "zh" ? "新销售钱包" : "New Sale Wallet"}<input value={tokenInputs.saleWallet} onChange={e => setTokenInputs(p => ({ ...p, saleWallet: e.target.value }))} placeholder="0x..." /></label>
              <div className="actions admin-actions-tight">
                <button className="ghost-btn" type="button"
                  onClick={() => void executeAction("set-sale-wallet", async () => {
                    validateAddress(tokenInputs.saleWallet);
                    await setSaleAllocationWallet(provider!, tokenInputs.saleWallet.trim());
                  }, lang === "zh" ? "销售钱包已更新。" : "Sale wallet updated.")} disabled={actionKey !== ""}>
                  {actionKey === "set-sale-wallet" ? t.loading : t.saveParam}
                </button>
              </div>
            </Card>

            <Card title={lang === "zh" ? "Swap 流动性管理" : "Swap Liquidity Management"} hint={lang === "zh" ? "向 SwapPoolManager 添加或移除流动性" : "Add or remove liquidity in SwapPoolManager"} className="grid-full">
              <ParamGuide title={guideLabel} items={paramGuides.tokenLiquidity} />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                <div>
                  <h4 style={{ margin: "0 0 8px" }}>{lang === "zh" ? "添加流动性" : "Add Liquidity"}</h4>
                  <label className="field">Pair ID<input value={tokenInputs.liqPairId} onChange={e => setTokenInputs(p => ({ ...p, liqPairId: e.target.value }))} /></label>
                  <label className="field">Amount0 (wei)<input value={tokenInputs.liqAmount0} onChange={e => setTokenInputs(p => ({ ...p, liqAmount0: e.target.value }))} /></label>
                  <label className="field">Amount1 (wei)<input value={tokenInputs.liqAmount1} onChange={e => setTokenInputs(p => ({ ...p, liqAmount1: e.target.value }))} /></label>
                  <div className="actions">
                    <button className="primary-btn" type="button"
                      onClick={() => void executeAction("add-liq", async () => {
                        const pid = Number(tokenInputs.liqPairId);
                        if (!Number.isInteger(pid) || pid < 0) throw new Error(lang === "zh" ? "Pair ID 非法" : "Invalid Pair ID");
                        await addSwapLiquidity(provider!, pid, parsePositiveWei(tokenInputs.liqAmount0), parsePositiveWei(tokenInputs.liqAmount1));
                      }, lang === "zh" ? "流动性已添加。" : "Liquidity added.")} disabled={actionKey !== ""}>
                      {actionKey === "add-liq" ? t.loading : lang === "zh" ? "添加" : "Add"}
                    </button>
                  </div>
                </div>
                <div>
                  <h4 style={{ margin: "0 0 8px" }}>{lang === "zh" ? "移除流动性" : "Remove Liquidity"}</h4>
                  <label className="field">Pair ID<input value={tokenInputs.rmPairId} onChange={e => setTokenInputs(p => ({ ...p, rmPairId: e.target.value }))} /></label>
                  <label className="field">Amount0 (wei)<input value={tokenInputs.rmAmount0} onChange={e => setTokenInputs(p => ({ ...p, rmAmount0: e.target.value }))} /></label>
                  <label className="field">Amount1 (wei)<input value={tokenInputs.rmAmount1} onChange={e => setTokenInputs(p => ({ ...p, rmAmount1: e.target.value }))} /></label>
                  <label className="field">{lang === "zh" ? "接收地址" : "To"}<input value={tokenInputs.rmTo} onChange={e => setTokenInputs(p => ({ ...p, rmTo: e.target.value }))} placeholder="0x..." /></label>
                  <div className="actions">
                    <button className="primary-btn" type="button" style={{ background: "var(--color-warning, #f59e0b)" }}
                      onClick={() => void executeAction("rm-liq", async () => {
                        validateAddress(tokenInputs.rmTo);
                        const pid = Number(tokenInputs.rmPairId);
                        if (!Number.isInteger(pid) || pid < 0) throw new Error(lang === "zh" ? "Pair ID 非法" : "Invalid Pair ID");
                        await removeSwapLiquidity(provider!, pid, parsePositiveWei(tokenInputs.rmAmount0), parsePositiveWei(tokenInputs.rmAmount1), tokenInputs.rmTo.trim());
                      }, lang === "zh" ? "流动性已移除。" : "Liquidity removed.")} disabled={actionKey !== ""}>
                      {actionKey === "rm-liq" ? t.loading : lang === "zh" ? "移除" : "Remove"}
                    </button>
                  </div>
                </div>
              </div>
            </Card>

            <Card title={lang === "zh" ? "手续费分发 / 创建默认池" : "Fee Distribution / Create Pools"} hint={lang === "zh" ? "分发手续费或创建默认交易池" : "Distribute fees or create default pools"}>
              <ParamGuide title={guideLabel} items={paramGuides.tokenDistribution} />
              <h4 style={{ margin: "0 0 8px" }}>{lang === "zh" ? "手续费分发" : "Distribute Fees"}</h4>
              <label className="field">Pair ID<input value={tokenInputs.distPairId} onChange={e => setTokenInputs(p => ({ ...p, distPairId: e.target.value }))} /></label>
              <label className="field">Token Address<input value={tokenInputs.distToken} onChange={e => setTokenInputs(p => ({ ...p, distToken: e.target.value }))} placeholder="0x..." /></label>
              <label className="field">{lang === "zh" ? "接收地址(逗号分隔)" : "Recipients (comma-separated)"}<input value={tokenInputs.distRecipients} onChange={e => setTokenInputs(p => ({ ...p, distRecipients: e.target.value }))} /></label>
              <label className="field">BPS(逗号分隔)<input value={tokenInputs.distBps} onChange={e => setTokenInputs(p => ({ ...p, distBps: e.target.value }))} /></label>
              <div className="actions admin-actions-tight">
                <button className="ghost-btn" type="button"
                  onClick={() => void executeAction("dist-fees", async () => {
                    validateAddress(tokenInputs.distToken);
                    const pid = Number(tokenInputs.distPairId);
                    if (!Number.isInteger(pid) || pid < 0) throw new Error(lang === "zh" ? "Pair ID 非法" : "Invalid Pair ID");
                    const recipients = tokenInputs.distRecipients.split(",").map(s => s.trim()).filter(Boolean);
                    if (recipients.length === 0) throw new Error(t.invalidDistributionEmpty);
                    recipients.forEach(validateAddress);
                    const bps = tokenInputs.distBps.split(",").map(s => s.trim()).filter(Boolean).map(parseBpsInput);
                    if (bps.length !== recipients.length) throw new Error(t.invalidDistribution);
                    await distributeSwapFees(provider!, pid, tokenInputs.distToken.trim(), recipients, bps);
                  }, lang === "zh" ? "手续费已分发。" : "Fees distributed.")} disabled={actionKey !== ""}>
                  {actionKey === "dist-fees" ? t.loading : lang === "zh" ? "分发" : "Distribute"}
                </button>
              </div>

              <h4 style={{ margin: "16px 0 8px" }}>{lang === "zh" ? "创建默认池" : "Create Default Pools"}</h4>
              <div className="admin-form-grid">
                <label className="field">USDT/ICO Fee BPS<input value={tokenInputs.defFeeBpsUsdtIco} onChange={e => setTokenInputs(p => ({ ...p, defFeeBpsUsdtIco: e.target.value }))} /></label>
                <label className="field">LIGHT/ICO Fee BPS<input value={tokenInputs.defFeeBpsLightIco} onChange={e => setTokenInputs(p => ({ ...p, defFeeBpsLightIco: e.target.value }))} /></label>
                <label className="field">Max Impact BPS<input value={tokenInputs.defMaxImpact} onChange={e => setTokenInputs(p => ({ ...p, defMaxImpact: e.target.value }))} /></label>
              </div>
              <div className="actions">
                <button className="primary-btn" type="button"
                  onClick={() => void executeAction("create-pools", async () => {
                    await createDefaultPools(provider!, parseBpsInput(tokenInputs.defFeeBpsUsdtIco), parseBpsInput(tokenInputs.defFeeBpsLightIco), parseBpsInput(tokenInputs.defMaxImpact));
                  }, lang === "zh" ? "默认池已创建。" : "Default pools created.")} disabled={actionKey !== ""}>
                  {actionKey === "create-pools" ? t.loading : lang === "zh" ? "创建" : "Create"}
                </button>
              </div>
            </Card>
          </section>
        )}

        {/* ════ 权限 / 系统 ════ */}
        {adminTab === "system" && canManageSystem && (
          <section className="grid">
            {/* 多管理员 */}
            <Card title={t.multiAdminTitle} hint={t.multiAdminHint}>
              <ParamGuide title={guideLabel} items={paramGuides.systemAdmin} />
              <p className="hint-text" style={{ marginBottom: "0.75rem" }}>{t.subAdminList}</p>
              {subAdmins.length === 0 ? (
                <p style={{ color: "var(--color-muted, #888)", fontSize: "0.875rem" }}>{t.noSubAdmins}</p>
              ) : (
                <ul className="list" style={{ marginBottom: "0.75rem" }}>
                  {subAdmins.map((addr) => (
                    <li key={addr} className="list-item" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem" }}>
                      <span style={{ fontFamily: "monospace", fontSize: "0.8rem", wordBreak: "break-all" }}>{addr}</span>
                      {isOwner && (
                        <button
                          className="ghost-btn"
                          type="button"
                          style={{ flexShrink: 0 }}
                          onClick={() => removeSubAdmin(addr)}
                          disabled={actionKey === `remove-sub-admin-${addr.toLowerCase()}` || actionKey !== ""}
                        >
                          {actionKey === `remove-sub-admin-${addr.toLowerCase()}` ? t.removing : t.removeSubAdmin}
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

            <Card title={t.managerTitle} hint={t.managerHint}>
              <ParamGuide title={guideLabel} items={paramGuides.systemAdmin} />
              <p className="hint-text" style={{ marginBottom: "0.75rem" }}>
                {lang === "zh" ? "按地址直接授权或移除经理角色。" : "Grant or remove manager role by address."}
              </p>
              <label className="field">
                {t.newManagerAddress}
                <input value={newManagerInput} onChange={(event) => setNewManagerInput(event.target.value)} placeholder="0x..." />
              </label>
              <div className="actions">
                <button className="primary-btn" type="button" onClick={addManager} disabled={!newManagerInput.trim()}>
                  {t.addManager}
                </button>
                <button className="ghost-btn" type="button" onClick={() => removeManager(newManagerInput.trim())} disabled={!newManagerInput.trim()}>
                  {t.removeManager}
                </button>
              </div>
            </Card>

            {/* Owner 转让 */}
            {isOwner && (
              <Card title={t.ownerTransferTitle} hint={t.ownerTransferHint}>
                <ParamGuide title={guideLabel} items={paramGuides.systemAdmin} />
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
                      if (!window.confirm(t.ownerTransferWarning)) throw new Error(lang === "zh" ? "用户已取消" : "Cancelled by user");
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

        {/* ════ 公告管理 ════ */}
        {adminTab === "announcements" && canManageAnnouncements && (
          <section className="grid">
            {/* 公告列表 */}
            <Card title={lang === "zh" ? `📢 公告列表 (${annList.length})` : `📢 Announcements (${annList.length})`} hint={lang === "zh" ? "管理当前所有公告，修改后点击发布即可生效" : "Manage announcements, click Publish to apply"} className="grid-full">
              <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
                <button className="ghost-btn" type="button" onClick={async () => {
                  setAnnLoading(true);
                  try {
                    const [rows, toggles] = await Promise.all([
                      fetchPublishedAnnouncements(),
                      fetchFrontendFeatureToggles(),
                    ]);
                    setAnnList(rows);
                    setEditingFeatureToggles(toggles);
                    onFeatureTogglesChange(toggles);
                    { const m = lang === "zh" ? `已加载 ${rows.length} 条公告` : `Loaded ${rows.length} announcements`; setLocalStatus(m); onStatusChange(m); }
                  } catch (e: any) { const m = `❌ ${e.message ?? e}`; setLocalStatus(m); onStatusChange(m); }
                  finally { setAnnLoading(false); }
                }}>{annLoading ? "…" : lang === "zh" ? "🔄 刷新" : "🔄 Refresh"}</button>
                <button className="ghost-btn" type="button" onClick={() => setAnnEditing(createEmptyAnnouncement())}>
                  {lang === "zh" ? "➕ 新增公告" : "➕ New"}
                </button>
                <button className="ghost-btn" type="button" disabled={annPublishing || !JSONBIN_MASTER_KEY}
                  onClick={async () => {
                    if (!JSONBIN_MASTER_KEY) { const m = lang === "zh" ? "未配置 VITE_JSONBIN_MASTER_KEY" : "VITE_JSONBIN_MASTER_KEY not configured"; setLocalStatus(m); onStatusChange(m); return; }
                    setAnnPublishing(true);
                    try {
                      await publishAnnouncementsToJsonBin(annList, JSONBIN_MASTER_KEY, editingFeatureToggles);
                      onFeatureTogglesChange(editingFeatureToggles);
                      { const m = lang === "zh" ? `✅ 已发布 ${annList.length} 条公告` : `✅ Published ${annList.length} announcements`; setLocalStatus(m); onStatusChange(m); }
                    } catch (e: any) { const m = `❌ ${e.message ?? e}`; setLocalStatus(m); onStatusChange(m); }
                    finally { setAnnPublishing(false); }
                  }}>
                  {annPublishing ? "…" : lang === "zh" ? "🚀 发布" : "🚀 Publish"}
                </button>
              </div>
              <div style={{
                border: "1px solid var(--border, #333)",
                borderRadius: "10px",
                padding: "12px",
                marginBottom: "12px",
                background: "var(--card-bg, #1a1a2e)",
              }}>
                <div style={{ fontWeight: 700, marginBottom: "6px" }}>{t.featureToggleTitle}</div>
                <p style={{ margin: "0 0 10px", fontSize: "12px", color: "var(--text-secondary)" }}>{t.featureToggleHint}</p>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: "8px" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px" }}>
                    <input
                      type="checkbox"
                      checked={editingFeatureToggles.showHomeMachine}
                      onChange={(event) => {
                        const next = { ...editingFeatureToggles, showHomeMachine: event.target.checked };
                        setEditingFeatureToggles(next);
                        setLocalStatus(t.featureToggleSaved);
                        onStatusChange(t.featureToggleSaved);
                      }}
                    />
                    {t.toggleHomeMachine}
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px" }}>
                    <input
                      type="checkbox"
                      checked={editingFeatureToggles.showMarket}
                      onChange={(event) => {
                        const next = { ...editingFeatureToggles, showMarket: event.target.checked };
                        setEditingFeatureToggles(next);
                        setLocalStatus(t.featureToggleSaved);
                        onStatusChange(t.featureToggleSaved);
                      }}
                    />
                    {t.toggleMarket}
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px" }}>
                    <input
                      type="checkbox"
                      checked={editingFeatureToggles.showSwap}
                      onChange={(event) => {
                        const next = { ...editingFeatureToggles, showSwap: event.target.checked };
                        setEditingFeatureToggles(next);
                        setLocalStatus(t.featureToggleSaved);
                        onStatusChange(t.featureToggleSaved);
                      }}
                    />
                    {t.toggleSwap}
                  </label>
                </div>
              </div>
              {annList.length === 0 && <p style={{ color: "var(--text-secondary)", fontSize: "13px" }}>{lang === "zh" ? "暂无公告，点击「新增」添加。" : "No announcements yet."}</p>}
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {annList.map((ann, idx) => (
                  <div key={ann.$id} style={{ padding: "10px 12px", background: "var(--card-bg, #1a1a2e)", borderRadius: "8px", border: "1px solid var(--border, #333)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                      <div>
                        <span style={{ fontWeight: 600, marginRight: "8px" }}>{ann.title || "(无标题)"}</span>
                        <span style={{ fontSize: "11px", padding: "2px 6px", borderRadius: "4px", background: ann.category === "system" ? "#2563eb30" : ann.category === "maintenance" ? "#f59e0b30" : ann.category === "risk" ? "#ef444430" : "#10b98130", color: ann.category === "system" ? "#60a5fa" : ann.category === "maintenance" ? "#fbbf24" : ann.category === "risk" ? "#f87171" : "#34d399" }}>
                          {ann.category}
                        </span>
                        {ann.pin && <span style={{ fontSize: "11px", marginLeft: "6px" }}>📌</span>}
                      </div>
                      <div style={{ display: "flex", gap: "6px" }}>
                        <button className="ghost-btn" style={{ fontSize: "12px", padding: "4px 8px", minHeight: "28px" }} type="button" onClick={() => setAnnEditing({ ...ann })}>
                          {lang === "zh" ? "编辑" : "Edit"}
                        </button>
                        <button className="ghost-btn" style={{ fontSize: "12px", padding: "4px 8px", minHeight: "28px", color: "#f87171" }} type="button" onClick={() => {
                          setAnnList((prev) => prev.filter((_, i) => i !== idx));
                          { const m = lang === "zh" ? "已删除（需点击「发布」同步到 JSONBin）" : "Deleted (click Publish to sync)"; setLocalStatus(m); onStatusChange(m); }
                        }}>
                          {lang === "zh" ? "删除" : "Del"}
                        </button>
                      </div>
                    </div>
                    <p style={{ fontSize: "13px", color: "var(--text-secondary)", margin: 0 }}>{ann.summary}</p>
                    <div style={{ fontSize: "11px", color: "var(--text-tertiary, #666)", marginTop: "4px" }}>
                      P:{ann.priority} | {ann.createdAt?.slice(0, 16)}
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            {/* 编辑/新增表单 */}
            {annEditing && (
              <Card title={lang === "zh" ? "✏️ 编辑公告" : "✏️ Edit Announcement"} hint={annEditing.$id} className="grid-full">
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  <input className="admin-input" placeholder={lang === "zh" ? "标题" : "Title"} value={annEditing.title} onChange={(e) => { const v = e.target.value; setAnnEditing((prev) => prev ? { ...prev, title: v } : prev); }} />
                  <input className="admin-input" placeholder={lang === "zh" ? "摘要" : "Summary"} value={annEditing.summary} onChange={(e) => { const v = e.target.value; setAnnEditing((prev) => prev ? { ...prev, summary: v } : prev); }} />
                  <textarea className="admin-input" placeholder={lang === "zh" ? "正文内容" : "Content"} rows={4} value={annEditing.content} onChange={(e) => { const v = e.target.value; setAnnEditing((prev) => prev ? { ...prev, content: v } : prev); }} style={{ resize: "vertical", fontFamily: "inherit" }} />
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                    <select className="admin-input" value={annEditing.category} onChange={(e) => { const v = e.target.value as Announcement["category"]; setAnnEditing((prev) => prev ? { ...prev, category: v } : prev); }} style={{ flex: 1 }}>
                      <option value="system">{lang === "zh" ? "系统" : "System"}</option>
                      <option value="campaign">{lang === "zh" ? "活动" : "Campaign"}</option>
                      <option value="maintenance">{lang === "zh" ? "维护" : "Maintenance"}</option>
                      <option value="risk">{lang === "zh" ? "风险" : "Risk"}</option>
                    </select>
                    <input className="admin-input" type="number" placeholder={lang === "zh" ? "优先级" : "Priority"} value={annEditing.priority} onChange={(e) => { const v = Number(e.target.value) || 0; setAnnEditing((prev) => prev ? { ...prev, priority: v } : prev); }} style={{ width: "100px" }} />
                    <label style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "13px" }}>
                      <input type="checkbox" checked={annEditing.pin} onChange={(e) => { const v = e.target.checked; setAnnEditing((prev) => prev ? { ...prev, pin: v } : prev); }} />
                      📌 {lang === "zh" ? "置顶" : "Pin"}
                    </label>
                  </div>
                  <div style={{ display: "flex", gap: "8px", marginTop: "4px" }}>
                    <button className="ghost-btn" type="button" onClick={() => {
                      if (!annEditing.title.trim() || !annEditing.summary.trim() || !annEditing.content.trim()) {
                        { const m = lang === "zh" ? "标题、摘要、内容不能为空" : "Title, summary, and content are required"; setLocalStatus(m); onStatusChange(m); }
                        return;
                      }
                      setAnnList((prev) => {
                        const idx = prev.findIndex((a) => a.$id === annEditing.$id);
                        if (idx >= 0) {
                          const copy = [...prev];
                          copy[idx] = annEditing;
                          return copy;
                        }
                        return [...prev, annEditing];
                      });
                      setAnnEditing(null);
                      { const m = lang === "zh" ? "已保存到本地（需点击「发布」同步到 JSONBin）" : "Saved locally (click Publish to sync)"; setLocalStatus(m); onStatusChange(m); }
                    }}>
                      {lang === "zh" ? "💾 保存" : "💾 Save"}
                    </button>
                    <button className="ghost-btn" type="button" onClick={() => setAnnEditing(null)}>
                      {lang === "zh" ? "取消" : "Cancel"}
                    </button>
                  </div>
                </div>
              </Card>
            )}
          </section>
        )}

        {/* ════ 配置说明 ════ */}
        {adminTab === "guide" && (
          <section className="grid">
            <Card title={lang === "zh" ? "📖 Admin 配置说明" : "📖 Admin Configuration Guide"} hint={lang === "zh" ? "快速了解各个配置功能" : "Quick reference for all settings"}>
              <div className="admin-guide-content">
                <div className="guide-section">
                  <h4>{lang === "zh" ? "🏠 总览 Tab" : "🏠 Overview Tab"}</h4>
                  <p>{lang === "zh" ? "显示系统当前状态、合约地址、Core 和 Swap 的暂停/恢复控制。可以点击按钮快速暂停或恢复对应的服务。" : "Displays current system status, contract addresses, and pause/resume controls for Core and Swap services. Click buttons to quickly toggle service state."}</p>
                </div>

                <div className="guide-section">
                  <h4>{lang === "zh" ? "💰 价格 Tab" : "💰 Prices Tab"}</h4>
                  <p>{lang === "zh" ? "管理矿机、节点和超节点的 USDT 价格。上方三个栅格显示链上当前价格，下方表格可编辑并保存新价格。所有金额以 USDT 计单位。" : "Manage USDT prices for machines, nodes, and super-nodes. Top grid shows current on-chain prices, table below allows editing and saving new prices. All amounts in USDT."}</p>
                </div>

                <div className="guide-section">
                  <h4>{lang === "zh" ? "🏦 资金池 Tab" : "🏦 Pools Tab"}</h4>
                  <p>{lang === "zh" ? "配置 Core 核心收入的分账地址和分账比例（BPS）。每个池子可独立设置接收地址（ERC-20 钱包）和分红比例。BPS 单位为万分之一，如 100 = 1%。" : "Configure recipient addresses and share ratios (BPS) for Core revenue distribution. Each pool can independently set a recipient address and share percentage. BPS is in basis points (100 = 1%)."}</p>
                </div>

                <div className="guide-section">
                  <h4>{lang === "zh" ? "🔄 市场 Tab" : "🔄 Market Tab"}</h4>
                  <p>{lang === "zh" ? "管理 OTC 市场的手续费、Swap 流动池的参数、LIGHT 代币的分账配置。包括手续费率、冲击上限、分账地址等核心参数。" : "Manage OTC market fees, Swap pool parameters, and LIGHT token distribution settings. Includes fee rates, impact limits, and recipient addresses."}</p>
                </div>

                <div className="guide-section">
                  <h4>{lang === "zh" ? "⚙️ 权限 Tab" : "⚙️ System Tab"}</h4>
                  <p>{lang === "zh" ? "管理子管理员权限和 Owner 转让。Owner 可添加或删除子管理员，以及将合约所有权转让给其他地址。操作需谨慎，确认无误后再执行。" : "Manage sub-admin permissions and Owner transfer. Owner can add/remove sub-admins and transfer contract ownership. Be careful with these operations."}</p>
                </div>

                <div className="guide-section">
                  <h4>{lang === "zh" ? "💡 常见问题" : "💡 FAQs"}</h4>
                  <ul className="guide-faq">
                    <li>{lang === "zh" ? "Q: 修改价格后什么时候生效？ A: 点击保存后立即关联到合约，下次用户操作时使用新价格。" : "Q: When do price changes take effect? A: Immediately after saving to contract, new prices apply on next user operation."}</li>
                    <li>{lang === "zh" ? "Q: 删除子管理员操作可以撤销吗？ A: 不可以，请务必确认无误后再操作。" : "Q: Can I undo removing a sub-admin? A: No, please confirm before removing."}</li>
                    <li>{lang === "zh" ? "Q: BPS 如何转换为百分比？ A: BPS % = BPS 值 ÷ 100，如 500 BPS = 5%。" : "Q: How to convert BPS to percentage? A: BPS% = BPS ÷ 100, e.g. 500 BPS = 5%."}</li>
                    <li>{lang === "zh" ? "Q: 如果操作失败怎么办？ A: 检查 Core 和 Swap 是否暂停，页面顶部会显示错误信息。" : "Q: What if an operation fails? A: Check if Core or Swap is paused. Error messages appear at top of page."}</li>
                  </ul>
                </div>

                <div className="guide-section guide-section-warning">
                  <h4>{lang === "zh" ? "⚠️ 重要提示" : "⚠️ Important"}</h4>
                  <ul className="guide-warning-list">
                    <li>{lang === "zh" ? "所有配置更改都会立即保存到区块链，无法撤销。" : "All configuration changes are immediately saved to blockchain and cannot be undone."}</li>
                    <li>{lang === "zh" ? "只有 Owner 和授权的子管理员可以访问此页面。" : "Only Owner and authorized sub-admins can access this page."}</li>
                    <li>{lang === "zh" ? "暂停 Core 或 Swap 将停止相关功能，用户无法进行操作。谨慎使用。" : "Pausing Core or Swap will stop related functionality. Use carefully."}</li>
                    <li>{lang === "zh" ? "所有地址输入必须是有效的以太坊地址（0x 开头）。" : "All address inputs must be valid Ethereum addresses (starting with 0x)."}</li>
                  </ul>
                </div>
              </div>
            </Card>
          </section>
        )}
      </div>
    </div>
  );
};

export default Admin;
