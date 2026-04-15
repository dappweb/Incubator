import { ConnectButton } from "@rainbow-me/rainbowkit";
import { BrowserProvider, FallbackProvider, isAddress, JsonRpcProvider } from "ethers";
import React, { useEffect, useMemo, useState } from "react";
import "./App.css";
import Admin from "./components/Admin";
import { Card, KVRow } from "./components/Common";
import { Leaderboard } from "./components/Leaderboard";
import { TokenHistory, type TokenType } from "./components/TokenHistory";
import {
  CNC_MAINNET_CHAIN_ID,
  CNC_MAINNET_CHAIN_NAME,
  CNC_MAINNET_RPC_URLS,
  CORE_CONTRACT_ADDRESS,
  ICO_TOKEN_ADDRESS,
  LIGHT_TOKEN_ADDRESS,
  OTC_CONTRACT_ADDRESS,
  PANCAKE_V3_PRIMARY_FEE_PPM,
  SWAP_POOL_ADDRESS,
  USDT_CONTRACT_ADDRESS,
} from "./config";
import { fetchPublishedAnnouncements, type Announcement } from "./lib/announcements";
import {
  bindReferrer,
  buyNode,
  buySuperNode,
  getContractOwner,
  getDirectReferralsByReferrer,
  getMachineOrder,
  getMachineUnitPrice,
  getNodePrice,
  getPoolAccumulatedBalances,
  getReferrer,
  getRewardRecordsByBeneficiary,
  getSuperNodePrice,
  getTeamStats,
  getUserMachineOrderIds,
  getUserRole,
  purchaseMachine,
  type MachineOrder,
  type RewardRecord,
  type TeamStats,
} from "./lib/coreContract";
import { parseContractError } from "./lib/errorParser";
import { approveIdentityForOtc, getTokenOfOwner, isIdentityApproved } from "./lib/identityContract";
import { currentDayId, fetchLeaderboardDay } from "./lib/leaderboard";
import {
  cancelOtcOrder,
  createOtcOrder,
  fillOtcOrder,
  getActiveOrderIds,
  getLastTradePriceByRole,
  getOrder,
  getOtcFeeBps,
  type OtcOrder,
} from "./lib/otcContract";
import {
  getPrimarySwapSpender,
  getSwapPool,
  getSwapPoolsInfo,
  quotePrimarySwapExactIn,
  quoteSwapExactIn,
  resolvePrimarySwapTokens,
  swapExactIn,
  swapPrimaryExactIn,
} from "./lib/swapContract";
import { approveToken, formatTokenAmount, getTokenAllowance, getTokenBalance, getTokenMeta, parseTokenAmount } from "./lib/tokenContract";
import { fetchTokenHistory, type TxRecord } from "./lib/tokenHistory";
import { approveUsdt, formatUsdt, getUsdtAllowance, getUsdtBalance, parseUsdt } from "./lib/usdtContract";
import {
  checkConnection,
  ensureCncMainnetNetwork, isOnCncMainnet, listenToWalletEvents,
  setupWalletAfterConnect
} from "./lib/wallet";

type TabKey = "overview" | "team" | "otc" | "swap" | "mine" | "admin";
type SwapSubTab = "primary" | "light";
type SwapDirection = "forward" | "reverse";

const LIGHT_ICO_PAIR_ID = 1;
const FIRST_CONNECT_GUIDE_DONE_KEY = "incubator:first-connect-guide-done";
const INOUT_LOOKBACK_DAYS = 7;
const INOUT_PREVIEW_LIMIT = 12;

const toSafeBigInt = (value: unknown): bigint => {
  if (typeof value === "bigint") {
    return value;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return BigInt(Math.trunc(value));
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return 0n;
    }
    try {
      return BigInt(trimmed);
    } catch {
      return 0n;
    }
  }

  return 0n;
};

const DESKTOP_TABS: Array<{ key: TabKey; label: string }> = [
  { key: "overview", label: "首页" },
  { key: "team", label: "团队" },
  { key: "otc", label: "市场" },
  { key: "swap", label: "兑换" },
  { key: "mine", label: "记录" },
];

const MOBILE_TABS: Array<{ key: TabKey; label: string }> = [
  { key: "overview", label: "首页" },
  { key: "team", label: "团队" },
  { key: "otc", label: "市场" },
  { key: "swap", label: "兑换" },
  { key: "mine", label: "记录" },
];

const App = () => {
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [lang, setLang] = useState<"zh" | "en">("zh");
  const langRef = React.useRef(lang);
  langRef.current = lang;

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  const toggleTheme = () => setTheme(prev => prev === "dark" ? "light" : "dark");
  const toggleLang = () => setLang(prev => prev === "zh" ? "en" : "zh");

  const t = {
    title: lang === "zh" ? "Incubator" : "Incubator",
    subtitle: lang === "zh" ? "节点购买、市场交易与链上兑换" : "Node access, market trading, and on-chain swaps",
    brandEyebrow: lang === "zh" ? "WEB3 CONTROL PANEL" : "WEB3 CONTROL PANEL",
    connect: lang === "zh" ? "连接钱包" : "Connect Wallet",
    disconnect: lang === "zh" ? "断开钱包" : "Disconnect",
    refresh: lang === "zh" ? "刷新数据" : "Refresh",
    copy: lang === "zh" ? "复制地址" : "Copy",
    copied: lang === "zh" ? "地址已复制" : "Address copied",
    switchNetwork: lang === "zh" ? "切换网络" : "Switch Network",
    headerBalance: lang === "zh" ? "钱包余额" : "Wallet Balance",
    headerRole: lang === "zh" ? "账户身份" : "Account Role",
    tab_overview: lang === "zh" ? "首页" : "Home",
    tab_machine: lang === "zh" ? "算力" : "Machines",
    tab_team: lang === "zh" ? "团队" : "Team",
    tab_otc: lang === "zh" ? "市场" : "Market",
    tab_swap: lang === "zh" ? "兑换" : "Swap",
    swapSubPrimary: lang === "zh" ? "兑换 (USDT/ICO)" : "Swap (USDT/ICO)",
    swapSubLight: lang === "zh" ? "回收 (LIGHT/ICO)" : "Recovery (LIGHT/ICO)",
    tab_mine: lang === "zh" ? "记录" : "Records",
    tab_admin: lang === "zh" ? "管理" : "Admin",
    address: lang === "zh" ? "钱包地址" : "Wallet",
    network: lang === "zh" ? "当前网络" : "Network",
    walletStatus: lang === "zh" ? "钱包状态" : "Wallet Status",
    connected: lang === "zh" ? "已连接" : "Connected",
    role: lang === "zh" ? "当前身份" : "Role",
    ownerPanel: lang === "zh" ? "Owner 面板" : "Owner Panel",
    balance: lang === "zh" ? "USDT 余额" : "USDT Balance",
    openAdminPanel: lang === "zh" ? "进入管理面板" : "Open Admin Panel",
    portfolioHint: lang === "zh" ? "先连接钱包，再开始购买、挂单或兑换操作。" : "Connect your wallet first to start buying, listing, or swapping.",
    notConnected: lang === "zh" ? "未连接" : "Not Connected",
    wrongNetwork: lang === "zh" ? "网络错误" : "Wrong Network",
    networkReady: lang === "zh" ? "网络正常" : "Network Ready",
    roleUser: lang === "zh" ? "普通用户" : "User",
    roleNode: lang === "zh" ? "节点用户" : "Node Holder",
    roleSuperNode: lang === "zh" ? "超级节点用户" : "Super Node Holder",
    pricesTitle: lang === "zh" ? "立即参与" : "Join Now",
    pricesHint: lang === "zh" ? "以下价格实时读取合约，提交交易前请再次确认。" : "Prices below are read live from the contract. Review them before confirming any transaction.",
    pricesGuideTitle: lang === "zh" ? "按当前价格直接购买身份" : "Buy access at live pricing",
    pricesGuideHint: lang === "zh" ? "想快速成交，可从这里直接进入购买算力、购买节点或购买超级节点流程。" : "Use these shortcuts to jump straight into buying a miner, node, or super node.",
    payMachineNow: lang === "zh" ? "立即购买算力" : "Buy Miner Now",
    payNodeNow: lang === "zh" ? "立即购买节点" : "Buy Node Now",
    paySuperNow: lang === "zh" ? "立即购买超级节点" : "Buy Super Node Now",
    machineUnitPrice: lang === "zh" ? "算力单价" : "Machine Price",
    nodePrice: lang === "zh" ? "节点价格" : "Node Price",
    superNodePrice: lang === "zh" ? "超级节点价格" : "Super Node Price",
    approvalsTitle: lang === "zh" ? "授权状态" : "Approvals",
    approvalsHint: lang === "zh" ? "授权决定你当前可直接执行的链上操作额度。" : "Allowances determine how much you can execute on-chain without re-approving.",
    coreApproval: lang === "zh" ? "Core 授权额度" : "Core Allowance",
    otcApproval: lang === "zh" ? "市场授权额度" : "Market Allowance",
    quickActionsTitle: lang === "zh" ? "快捷入口" : "Quick Actions",
    quickActionsHint: lang === "zh" ? "移动端底部菜单已精简，兑换入口可从这里快速进入。" : "The mobile menu is simplified. You can jump to Swap from here anytime.",
    goSwap: lang === "zh" ? "前往兑换" : "Go to Swap",
    poolPanelTitle: lang === "zh" ? "平台资金池" : "Platform Pools",
    poolPanelHint: lang === "zh" ? "实时显示各资金池当前余额与流动性储备。" : "Live view of all pool balances and liquidity reserves.",
    poolPrimary: lang === "zh" ? "聚合交易池" : "Aggregated Trading Pool",
    poolLight: lang === "zh" ? "Light算力合约池" : "Light Computing Pool",
    poolSuperNode: lang === "zh" ? "超级节点奖励" : "Super Node Rewards",
    poolNode: lang === "zh" ? "节点奖励" : "Node Rewards",
    poolPlatform: lang === "zh" ? "USDT契约池" : "USDT Contract Pool",
    poolLeaderboard: lang === "zh" ? "FOMO奖励" : "FOMO Rewards",
    myWallet: lang === "zh" ? "我的钱包" : "My Wallet",
    buyNodeNow: lang === "zh" ? "抢购节点" : "Buy Node",
    addTokenTitle: lang === "zh" ? "复制代币地址" : "Copy Token Addresses",
    addTokenHint: lang === "zh" ? "快速复制项目代币合约地址，便于粘贴到钱包或区块浏览器中查看。" : "Quickly copy the project token contract addresses for wallet import or block explorer lookup.",
    addIcoToken: lang === "zh" ? "复制 ICO 地址" : "Copy ICO Address",
    addLightToken: lang === "zh" ? "复制 LIGHT 地址" : "Copy LIGHT Address",
    tokenAdded: lang === "zh" ? "地址已复制" : "Address copied",
    tokenAddFailed: lang === "zh" ? "复制地址失败" : "Failed to copy address",
    tokenConfigMissing: lang === "zh" ? "代币地址未配置" : "Token address is not configured",
    machineTitle: lang === "zh" ? "购买算力" : "Buy Mining Machines",
    machineBadge: lang === "zh" ? "MINER ENTRY" : "MINER ENTRY",
    machineHint: lang === "zh" ? "适合希望快速参与生态的用户，可按需灵活购买数量。" : "Designed for users who want fast access to the ecosystem with flexible quantity selection.",
    machineBusinessHint: lang === "zh" ? "算力订单按 60% LP 底池、5% 直推、5% 超级节点池、8% 节点池、20% 平台、2% 排行榜池入账（其中日榜 1.5%，幸运榜 0.5%）。" : "Machine orders flow into the 60% LP base pool, 5% referral, 5% super-node pool, 8% node pool, 20% platform, and 2% leaderboard pool (1.5% daily top ranking + 0.5% lucky ranking).",
    machineHeroTitle: lang === "zh" ? "轻量入场，快速建立算力仓位" : "Start light, build your miner position fast",
    machineHeroDesc: lang === "zh" ? "算力购买已整合到首页，适合新用户直接完成授权、下单与首笔生态配置。" : "Machine purchase now lives on the home page so new users can approve, place orders and complete their first allocation in one flow.",
    machineFeatureA: lang === "zh" ? "支持 1-10 台灵活购买" : "Flexible orders from 1 to 10 units",
    machineFeatureB: lang === "zh" ? "授权完成后可连续下单" : "Repeat orders once allowance is ready",
    machineFeatureC: lang === "zh" ? "适合作为节点升级前置仓位" : "Useful as a pre-node accumulation position",
    machineQtyLabel: lang === "zh" ? "本次购买" : "This order",
    machineAllowanceLabel: lang === "zh" ? "可用授权" : "Allowance ready",
    machineGapLabel: lang === "zh" ? "仍需授权" : "Allowance gap",
    machineAllowanceReady: lang === "zh" ? "授权已满足当前下单" : "Allowance already covers this order",
    referrerCardTitle: lang === "zh" ? "绑定推荐人" : "Bind Referrer",
    referrerCardHint: lang === "zh" ? "购买算力 / 节点 / 超级节点前，必须先绑定推荐人。默认推荐人为合约 Owner，绑定后不可更改。" : "You must bind a referrer before purchasing. Default referrer is the contract owner. Cannot be changed once bound.",
    referrerInputLabel: lang === "zh" ? "推荐人地址" : "Referrer Address",
    referrerInputTip: lang === "zh" ? "默认推荐人为合约 Owner，如有其他推荐人可手动修改。绑定后写入链上，不可更改。" : "Default referrer is the contract owner. You may change it manually. Once bound, it is stored on-chain and cannot be changed.",
    referrerFromLink: lang === "zh" ? "来源：邀请链接" : "Source: invite link",
    referrerFromChain: lang === "zh" ? "来源：链上已绑定" : "Source: on-chain bound",
    referrerFromOwner: lang === "zh" ? "来源：默认（合约 Owner）" : "Source: default (contract owner)",
    referrerFromManual: lang === "zh" ? "来源：手动输入" : "Source: manual input",
    machineAutoApproveHint: lang === "zh" ? "支付时将自动完成所需 USDT 授权，无需额外点击授权。" : "Required USDT approval is completed automatically during payment.",
    quantity: lang === "zh" ? "购买数量（1-10）" : "Quantity (1-10)",
    referrer: lang === "zh" ? "推荐人地址" : "Referrer Address",
    orderTotal: lang === "zh" ? "预计支付" : "Estimated Cost",
    approveCore: lang === "zh" ? "授权 Core" : "Approve Core",
    submitMachine: lang === "zh" ? "确认购买" : "Buy Now",
    insufficientApproval: lang === "zh" ? "若授权不足，系统会在支付流程中自动补齐。" : "If allowance is insufficient, it will be completed automatically in the payment flow.",
    nodeTitle: lang === "zh" ? "购买节点" : "Buy Node",
    nodeDesc: lang === "zh" ? "无需门槛，可直接购买节点资格；算力侧 8% 节点奖池先入池，节点身份也可进入 OTC 市场流转。" : "No entry requirement. Buy node access directly; the 8% node pool accrues first and the identity can later circulate in the OTC market.",
    buyNode: lang === "zh" ? "立即购买节点" : "Buy Node",
    buyNodeLocked: lang === "zh" ? "已拥有节点身份" : "Node Already Owned",
    superNodeTitle: lang === "zh" ? "购买超级节点" : "Buy Super Node",
    superNodeDesc: lang === "zh" ? "可直接购买超级节点资格；算力侧 5% 超级节点奖池先入池，超级节点身份同样支持 OTC 流转。" : "Buy super-node access directly; the 5% super-node pool accrues first and the identity can also circulate through OTC.",
    buySuperNode: lang === "zh" ? "立即购买超级节点" : "Buy Super Node",
    buySuperNodeLocked: lang === "zh" ? "已拥有超级节点身份" : "Already a Super Node",
    alreadySuperNode: lang === "zh" ? "已拥有超级节点身份" : "Already a Super Node",
    flowTitle: lang === "zh" ? "购买流程" : "Purchase Flow",
    flowHint: lang === "zh" ? "按步骤完成后可减少失败率与重复操作。" : "Follow these steps to reduce failures and repeat actions.",
    stepConnect: lang === "zh" ? "连接钱包" : "Connect Wallet",
    stepReferrer: lang === "zh" ? "确认推荐人" : "Confirm Referrer",
    bindReferrer: lang === "zh" ? "绑定推荐人" : "Bind Referrer",
    bindDefaultReferrer: lang === "zh" ? "绑定默认推荐人" : "Bind Default Referrer",
    bindReferrerDone: lang === "zh" ? "已绑定推荐人" : "Referrer Bound",
    stepApprove: lang === "zh" ? "USDT 授权就绪" : "USDT Allowance Ready",
    stepPurchase: lang === "zh" ? "提交购买" : "Submit Purchase",
    accountSnapshot: lang === "zh" ? "账户快照" : "Account Snapshot",
    accountHint: lang === "zh" ? "关键状态一屏可见，减少来回切换。" : "Keep key states visible to reduce context switching.",
    needConnectToBuy: lang === "zh" ? "请先连接钱包" : "Connect wallet first",
    needCncMainnetToBuy: lang === "zh" ? "请先切换到 CNC Mainnet" : "Switch to CNC Mainnet first",
    needReferrerToBuy: lang === "zh" ? "请先绑定推荐人" : "Bind a referrer first",
    roleMismatchForNode: lang === "zh" ? "当前身份不可重复购买节点" : "Current role cannot buy node again",
    roleMismatchForSuper: lang === "zh" ? "" : "",
    otcTitle: lang === "zh" ? "节点 / 超级节点市场" : "Node / Super-Node Market",
    otcHint: lang === "zh" ? "节点与超级节点身份都可在此挂卖或购买；成交价不能低于对应身份的上次成交价，且卖出扣 10% 手续费。" : "Node and super-node identities can both be traded here; listings cannot go below the last trade price for that role and selling charges a 10% fee by default.",
    myIdentity: lang === "zh" ? "我的身份 ID" : "My Identity ID",
    myIdentityRole: lang === "zh" ? "我的身份类型" : "My Identity Role",
    none: lang === "zh" ? "暂无" : "None",
    identityApproval: lang === "zh" ? "身份授权状态" : "Identity Approval",
    approved: lang === "zh" ? "已授权" : "Approved",
    notApproved: lang === "zh" ? "未授权" : "Not Approved",
    otcPrice: lang === "zh" ? "挂单价格（USDT）" : "Listing Price (USDT)",
    approveIdentity: lang === "zh" ? "授权身份 ID" : "Approve Identity",
    approveOtc: lang === "zh" ? "授权市场 USDT" : "Approve Market USDT",
    createListing: lang === "zh" ? "创建挂单" : "Create Listing",
    otcAutoApproveHint: lang === "zh" ? "首次挂单或购买时，将自动完成所需身份 / USDT 授权。" : "Required identity or USDT approvals are completed automatically on first list or buy.",
    otcRuleTitle: lang === "zh" ? "市场规则" : "Market Rules",
    otcRuleHint: lang === "zh" ? "按当前业务口径展示交易门槛、手续费与价格约束。" : "Shows the current business rules for fees and price constraints.",
    otcFeeRate: lang === "zh" ? "市场手续费" : "Market Fee",
    otcNodeLastPrice: lang === "zh" ? "节点上次成交价" : "Last Node Trade",
    otcSuperLastPrice: lang === "zh" ? "超节点上次成交价" : "Last Super-Node Trade",
    otcRuleSingleListing: lang === "zh" ? "同一个身份 ID 只能存在 1 个活跃挂单。" : "Each identity ID can only have one active listing at a time.",
    otcRuleFloorPrice: lang === "zh" ? "新挂单价格不能低于该身份类型的上次成交价；低价旧单会在更高成交后自动失效。" : "New listings cannot go below the last trade price for that role; older lower-priced listings are auto-cancelled after a higher fill.",
    activeListings: lang === "zh" ? "市场挂单" : "Market Listings",
    noListings: lang === "zh" ? "当前暂无可交易挂单。" : "No active listings right now.",
    orderId: lang === "zh" ? "订单ID" : "Order ID",
    identityId: lang === "zh" ? "身份ID" : "Identity ID",
    otcRole: lang === "zh" ? "身份类型" : "Role",
    seller: lang === "zh" ? "卖家" : "Seller",
    priceUsdt: lang === "zh" ? "价格(USDT)" : "Price (USDT)",
    action: lang === "zh" ? "操作" : "Action",
    cancel: lang === "zh" ? "撤单" : "Cancel",
    fill: lang === "zh" ? "购买" : "Buy",
    teamTitle: lang === "zh" ? "我的团队" : "My Team",
    teamHint: lang === "zh" ? "查看你的直推成员与团队贡献，数据随链上更新。" : "View your direct referrals and team contributions. Updates follow on-chain state.",
    teamTotal: lang === "zh" ? "团队总人数" : "Total Members",
    teamDirects: lang === "zh" ? "直推人数" : "Direct Referrals",
    teamDirectVolume: lang === "zh" ? "直推业绩" : "Direct Volume",
    teamTotalVolume: lang === "zh" ? "团队业绩" : "Team Volume",
    myReferrerTab: lang === "zh" ? "我的推荐人" : "My Referrer",
    myDirectsTab: lang === "zh" ? "我的直推人" : "My Direct Referrals",
    myReferrerTitle: lang === "zh" ? "我的推荐人地址" : "My Referrer Address",
    myDirectsTitle: lang === "zh" ? "我的直推列表" : "My Direct Referral List",
    noReferrerBound: lang === "zh" ? "当前尚未绑定推荐人。" : "No referrer is bound yet.",
    noDirectReferrals: lang === "zh" ? "当前暂无直推成员。" : "No direct referrals yet.",
    directReferralCountLabel: lang === "zh" ? "直推地址数" : "Direct Referral Addresses",
    inviteTitle: lang === "zh" ? "邀请好友" : "Invite Friends",
    inviteHint: lang === "zh" ? "分享你的专属链接，邀请好友加入生态。" : "Share your exclusive link to invite friends to the ecosystem.",
    inviteLink: lang === "zh" ? "你的邀请链接" : "Your Invite Link",
    copyLink: lang === "zh" ? "复制链接" : "Copy Link",
    linkCopied: lang === "zh" ? "链接已复制" : "Link Copied",
    swapTitle: lang === "zh" ? "Swap 即时兑换" : "Swap",
    swapHint: lang === "zh" ? "先查看报价与滑点，再确认兑换，避免实际到账与预期偏差过大。" : "Check quote and slippage first to avoid large gaps between expected and actual output.",
    swapAutoHint: lang === "zh" ? "输入数量、切换方向或交易池后，系统会自动刷新报价。" : "Quotes refresh automatically when you change pool, direction, or amount.",
    swapPoolPrimaryDesc: lang === "zh" ? "主流动性池，支持 USDT 与 ICO 双向兑换。" : "Primary liquidity pool for two-way USDT and ICO swaps.",
    swapPoolLightDesc: lang === "zh" ? "单向回收池，只允许 LIGHT 兑换为 ICO。" : "One-way recovery pool that only allows LIGHT to be swapped into ICO.",
    swapPool: lang === "zh" ? "选择交易池" : "Pool",
    swapPoolMode: lang === "zh" ? "池模式" : "Pool Mode",
    swapRoute: lang === "zh" ? "当前路线" : "Current Route",
    swapDirection: lang === "zh" ? "兑换方向" : "Direction",
    reverseDirection: lang === "zh" ? "反转方向" : "Reverse",
    swapDirectionLocked: lang === "zh" ? "该池为单向兑换，方向已锁定为 LIGHT -> ICO。" : "This pool is one-way only. Route is locked to LIGHT -> ICO.",
    inputAmount: lang === "zh" ? "输入数量" : "Amount In",
    swapInputAsset: lang === "zh" ? "输入资产" : "Input Asset",
    swapOutputAsset: lang === "zh" ? "输出资产" : "Output Asset",
    max: lang === "zh" ? "全部" : "Max",
    slippage: lang === "zh" ? "滑点容忍（bps）" : "Slippage (bps)",
    fee: lang === "zh" ? "池手续费" : "Pool Fee",
    impactLimit: lang === "zh" ? "价格冲击上限" : "Impact Limit",
    tokenBalance: lang === "zh" ? "输入币种余额" : "Input Token Balance",
    tokenAllowance: lang === "zh" ? "输入币种授权" : "Input Token Allowance",
    swapApprovalReady: lang === "zh" ? "授权状态" : "Approval State",
    estimatedOutput: lang === "zh" ? "预计到账" : "Estimated Output",
    estimatedFee: lang === "zh" ? "预计手续费" : "Estimated Fee",
    estimatedImpact: lang === "zh" ? "预计价格冲击" : "Estimated Price Impact",
    quoteStatus: lang === "zh" ? "兑换状态" : "Swap Status",
    quoteReady: lang === "zh" ? "报价可用，可直接继续。" : "Quote ready. You can continue.",
    quoteNeedAmount: lang === "zh" ? "请输入兑换数量以获取报价。" : "Enter an amount to get a quote.",
    quoteInsufficientBalance: lang === "zh" ? "余额不足，请调整数量或更换钱包。" : "Insufficient balance. Reduce the amount or switch wallet.",
    quoteNeedApproval: lang === "zh" ? "授权不足，请先授权输入币。" : "Allowance is too low. Approve the input token first.",
    swapFlowTitle: lang === "zh" ? "兑换流程" : "Swap Flow",
    swapStepAmount: lang === "zh" ? "输入数量" : "Enter Amount",
    swapStepApprove: lang === "zh" ? "完成授权" : "Approve Token",
    swapStepExecute: lang === "zh" ? "确认兑换" : "Confirm Swap",
    swapNextAction: lang === "zh" ? "下一步操作" : "Next Action",
    swapActionApproveHint: lang === "zh" ? "当前额度不足，先完成输入币授权后再发起兑换。" : "Allowance is too low. Approve the input token before swapping.",
    swapActionExecuteHint: lang === "zh" ? "报价和授权都已满足，可以直接提交兑换。" : "Quote and allowance are ready. You can submit the swap now.",
    swapActionWaitHint: lang === "zh" ? "先输入有效数量，系统会自动给出报价和后续操作。" : "Enter a valid amount first. The app will prepare the quote and next step automatically.",
    swapRouteLockedBadge: lang === "zh" ? "方向已锁定" : "Route Locked",
    swapNeedQuoteHint: lang === "zh" ? "先输入数量并等待报价刷新。" : "Enter an amount and wait for the quote to refresh.",
    lowImpact: lang === "zh" ? "价格冲击较低" : "Low price impact",
    mediumImpact: lang === "zh" ? "价格冲击中等" : "Medium price impact",
    highImpact: lang === "zh" ? "价格冲击偏高，请谨慎确认。" : "High price impact. Review carefully before swapping.",
    swapPrimaryMode: lang === "zh" ? "双向主池" : "Two-way main pool",
    swapLightMode: lang === "zh" ? "单向回收池" : "One-way recovery pool",
    swapLightDistributionTitle: lang === "zh" ? "LIGHT 业务分流" : "LIGHT distribution",
    swapLightDistribution: lang === "zh" ? "60% 销毁 · 30% 回流启动池 · 7% 节点池 · 3% 超级节点池" : "60% burn · 30% bootstrap pool · 7% node pool · 3% super node pool",
    refreshQuote: lang === "zh" ? "刷新报价" : "Refresh Quote",
    approveToken: lang === "zh" ? "授权输入币" : "Approve Token",
    executeSwap: lang === "zh" ? "确认兑换" : "Swap Now",
    swapping: lang === "zh" ? "正在执行兑换" : "Executing swap",
    swapSuccess: lang === "zh" ? "兑换成功" : "Swap completed",
    ordersTitle: lang === "zh" ? "出入金记录" : "In/Out Records",
    ordersHint: lang === "zh" ? "这里按 ICO / USDT / LIGHT 分开展示近期链上出入金记录。" : "This section groups recent in/out records by ICO / USDT / LIGHT.",
    noOrders: lang === "zh" ? "暂无出入金记录。" : "No in/out records yet.",
    noTokenOrders: lang === "zh" ? "当前代币暂无出入金记录。" : "No in/out records for this token yet.",
    loadingTokenOrders: lang === "zh" ? "正在加载代币出入金记录..." : "Loading token in/out records...",
    tokenOrdersWindow: lang === "zh" ? `统计窗口：最近 ${INOUT_LOOKBACK_DAYS} 天` : `Window: last ${INOUT_LOOKBACK_DAYS} days`,
    tokenOrderType: lang === "zh" ? "类型" : "Type",
    tokenOrderCounterparty: lang === "zh" ? "对手方" : "Counterparty",
    tokenOrderTime: lang === "zh" ? "时间" : "Time",
    machineOrdersTitle: lang === "zh" ? "算力订单记录" : "Computing Order Records",
    machineOrdersHint: lang === "zh" ? "该区块仅展示算力购买订单。" : "This section only shows computing purchase orders.",
    assetsTitle: lang === "zh" ? "我的资产视图" : "My Assets",
    assetsHint: lang === "zh" ? "汇总当前钱包的身份、余额、授权与订单奖励概览。" : "Overview of wallet role, balances, allowances, orders, and rewards.",
    totalMachineOrders: lang === "zh" ? "算力订单总数" : "Total Machine Orders",
    recentMachineUnits: lang === "zh" ? "最近订单算力数" : "Recent Machine Units",
    recentMachineAmount: lang === "zh" ? "最近订单金额" : "Recent Order Amount",
    recentRewardCount: lang === "zh" ? "最近奖励笔数" : "Recent Reward Count",
    recentRewardAmount: lang === "zh" ? "最近奖励金额" : "Recent Reward Amount",
    loadedRecentOrders: lang === "zh" ? "已加载最近订单" : "Loaded Recent Orders",
    loadedRecentRewards: lang === "zh" ? "已加载最近奖励" : "Loaded Recent Rewards",
    rewardsTitle: lang === "zh" ? "奖励记录" : "Reward Records",
    rewardsHint: lang === "zh" ? "仅展示当前钱包链上已结算奖励；节点池、超级节点池与排行榜池按业务口径先入池，再由后续日结流程发放。" : "Shows only settled on-chain rewards; node, super-node, and leaderboard funds accrue into their pools first and are distributed by a later daily settlement flow.",
    noRewards: lang === "zh" ? "暂无奖励记录。" : "No reward records yet.",
    rewardOrder: lang === "zh" ? "来源订单" : "Source Order",
    rewardPool: lang === "zh" ? "奖励池" : "Reward Pool",
    rewardAmount: lang === "zh" ? "奖励金额" : "Reward Amount",
    blockNumber: lang === "zh" ? "区块" : "Block",
    amount: lang === "zh" ? "金额" : "Amount",
    quantityUnit: lang === "zh" ? "台" : "units",
    timestamp: lang === "zh" ? "下单时间" : "Order Date",
    announcementsTitle: lang === "zh" ? "奖励记录与公告" : "Rewards & Announcements",
    announcementsHint: lang === "zh" ? "奖励记录功能将逐步上线，当前先展示平台公告与活动信息。" : "Reward records are rolling out. For now, this panel shows platform announcements and campaign updates.",
    noAnnouncements: lang === "zh" ? "暂无奖励记录或公告内容。" : "No reward records or announcements yet.",
    homeAnnouncementsTitle: lang === "zh" ? "首页公告" : "Home Announcements",
    homeAnnouncementsHint: lang === "zh" ? "最新公告会优先展示在首页。" : "Latest announcements are highlighted on the home page.",
    homeNoAnnouncements: lang === "zh" ? "暂无公告。" : "No announcements yet.",
    walletConnected: lang === "zh" ? "钱包连接成功，数据已同步。" : "Wallet connected and data synced.",
    walletDisconnected: lang === "zh" ? "钱包已断开连接。" : "Wallet disconnected.",
    walletConnectFailed: lang === "zh" ? "连接钱包失败" : "Failed to connect wallet",
    connectFirst: lang === "zh" ? "请先连接钱包。" : "Please connect your wallet first.",
    switchCncMainnet: lang === "zh" ? "请先切换到 CNC Mainnet 网络。" : "Please switch to CNC Mainnet first.",
    txFailed: lang === "zh" ? "交易执行失败" : "Transaction failed",
    missingCoreConfig: lang === "zh" ? "缺少 VITE_CORE_CONTRACT_ADDRESS 配置" : "Missing VITE_CORE_CONTRACT_ADDRESS",
    approvingUsdtCore: lang === "zh" ? "正在提交 Core 的 USDT 授权..." : "Submitting Core USDT approval...",
    approvedCoreSuccess: lang === "zh" ? "Core 授权已完成。" : "Core approval confirmed.",
    autoApproveThenPay: lang === "zh" ? "检测到授权不足，正在自动补齐授权..." : "Allowance is insufficient. Completing approval automatically...",
    missingOtcConfig: lang === "zh" ? "缺少 VITE_OTC_CONTRACT_ADDRESS 配置" : "Missing VITE_OTC_CONTRACT_ADDRESS",
    approvingUsdtOtc: lang === "zh" ? "正在提交 OTC 的 USDT 授权..." : "Submitting OTC USDT approval...",
    approvedOtcSuccess: lang === "zh" ? "市场 USDT 授权已完成。" : "Market USDT approval confirmed.",
    invalidMachineQty: lang === "zh" ? "算力购买数量需在 1 到 10 之间。" : "Machine quantity must be between 1 and 10.",
    invalidReferrer: lang === "zh" ? "推荐人地址格式不正确。" : "Invalid referrer address.",
    invalidSelfReferrer: lang === "zh" ? "推荐人不能是当前钱包地址，且当前无法回退到合约 Owner。" : "Referrer cannot be your own wallet address and no contract-owner fallback is available.",
    selfReferrerFallback: lang === "zh" ? "检测到自邀请，提交时会自动回退为合约 Owner。" : "Self-referral detected. Submission will fall back to the contract owner.",
    referrerAlreadyBound: lang === "zh" ? "推荐人已绑定，无需重复操作。" : "Referrer already bound.",
    bindingReferrer: lang === "zh" ? "正在绑定推荐人..." : "Binding referrer...",
    bindReferrerSuccess: lang === "zh" ? "推荐人绑定成功。" : "Referrer bound successfully.",
    buyingMachine: lang === "zh" ? "正在提交算力购买交易..." : "Submitting machine purchase...",
    buyMachineSuccess: lang === "zh" ? "算力购买成功。" : "Machine purchase completed.",
    buyingNode: lang === "zh" ? "正在提交节点购买交易..." : "Submitting node purchase...",
    buyNodeSuccess: lang === "zh" ? "节点购买成功。" : "Node purchase completed.",
    buyingSuperNode: lang === "zh" ? "正在提交超级节点购买交易..." : "Submitting super node purchase...",
    buySuperNodeSuccess: lang === "zh" ? "超级节点购买成功。" : "Super node purchase completed.",
    noIdentity: lang === "zh" ? "当前钱包下没有身份 ID。" : "No identity ID found for this wallet.",
    approvingIdentity: lang === "zh" ? "正在提交身份 ID 授权..." : "Submitting identity approval...",
    approvedIdentitySuccess: lang === "zh" ? "身份 ID 授权已完成。" : "Identity approval confirmed.",
    invalidListingPrice: lang === "zh" ? "请输入有效的挂单价格。" : "Please enter a valid listing price.",
    creatingListing: lang === "zh" ? "正在创建节点挂单..." : "Creating node listing...",
    createListingSuccess: lang === "zh" ? "节点挂单已创建。" : "Node listing created.",
    fillingOrder: lang === "zh" ? "正在购买挂单" : "Filling order",
    fillOrderSuccess: lang === "zh" ? "挂单购买成功" : "Order filled successfully",
    cancellingOrder: lang === "zh" ? "正在撤销挂单" : "Cancelling order",
    cancelOrderSuccess: lang === "zh" ? "挂单已撤销" : "Order cancelled",
    quoteRefreshed: lang === "zh" ? "报价已刷新。" : "Quote refreshed.",
    quoteRefreshFailed: lang === "zh" ? "刷新报价失败" : "Failed to refresh quote",
    missingSwapConfig: lang === "zh" ? "缺少 VITE_SWAP_POOL_ADDRESS 配置" : "Missing VITE_SWAP_POOL_ADDRESS",
    refreshSwapFirst: lang === "zh" ? "请先刷新 Swap 报价。" : "Please refresh the swap quote first.",
    approvingToken: lang === "zh" ? "正在提交代币授权..." : "Submitting token approval...",
    approveTokenSuccess: lang === "zh" ? "输入币授权已完成。" : "Token approval confirmed.",
    getValidQuoteFirst: lang === "zh" ? "请先获取有效报价。" : "Please get a valid quote first.",
    insufficientUsdtBalance: lang === "zh" ? "USDT 余额不足，请先充值后再操作" : "Insufficient USDT balance — please top up first",
    insufficientTokenBalance: lang === "zh" ? "输入代币余额不足，无法完成兑换" : "Insufficient token balance for swap",
    priceImpactBlocked: lang === "zh" ? "价格影响超出池子限额，流动性不足，请减少兑换数量" : "Price impact exceeds pool limit — reduce the swap amount",
    nav: lang === "zh" ? "导航" : "Navigation",
    statusReady: lang === "zh" ? "系统就绪" : "System Ready",
    loading: lang === "zh" ? "加载中..." : "Loading...",
    firstGuideTitle: lang === "zh" ? "新钱包快速引导" : "New Wallet Quick Setup",
    firstGuideHint: lang === "zh" ? "一键完成基础配置：网络 → 代币 → 推荐人 → 数据刷新。" : "Complete base setup in one click: network → tokens → referrer → data refresh.",
    firstGuideStepNetwork: lang === "zh" ? "1. 切换并确认 CNC Mainnet 网络" : "1. Switch and confirm CNC Mainnet network",
    firstGuideStepToken: lang === "zh" ? "2. 添加 USDT / ICO / LIGHT 到钱包" : "2. Add USDT / ICO / LIGHT to wallet",
    firstGuideStepReferrer: lang === "zh" ? "3. 绑定推荐人（若需要可跳过）" : "3. Bind a referrer (optional, can skip)",
    firstGuideStepRefresh: lang === "zh" ? "4. 刷新链上数据与权限状态" : "4. Refresh on-chain data and allowances",
    firstGuideRun: lang === "zh" ? "一键完成" : "Run One-Click Setup",
    firstGuideLater: lang === "zh" ? "稍后" : "Later",
    firstGuideRunning: lang === "zh" ? "引导执行中..." : "Running setup...",
    firstGuideDone: lang === "zh" ? "首次引导已完成。" : "First-time setup completed.",
  };

  const [address, setAddress] = useState("");
  const [chainId, setChainId] = useState(0);
  const [provider, setProvider] = useState<BrowserProvider | null>(null);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [_status, setStatus] = useState("");
  const [contractOwner, setContractOwner] = useState("");
  const [showFirstConnectGuide, setShowFirstConnectGuide] = useState(false);
  const [firstConnectGuideRunning, setFirstConnectGuideRunning] = useState(false);
  const [addingTokenSymbol, setAddingTokenSymbol] = useState<"ICO" | "LIGHT" | null>(null);

  const [machineQty, setMachineQty] = useState(1);
  const [machineReferrer, setMachineReferrer] = useState("");
  const [referrerSource, setReferrerSource] = useState<"none" | "link" | "onchain" | "owner" | "manual">("none");
  const [machinePrice, setMachinePrice] = useState<bigint>(0n);
  const [nodePrice, setNodePrice] = useState<bigint>(0n);
  const [superPrice, setSuperPrice] = useState<bigint>(0n);
  const [role, setRole] = useState(0);
  const [usdtBalance, setUsdtBalance] = useState<bigint>(0n);
  const [coreAllowance, setCoreAllowance] = useState<bigint>(0n);
  const [otcAllowance, setOtcAllowance] = useState<bigint>(0n);

  // P0-3: Machine purchase two-step flow
  const [usdtApprovalInProgress, setUsdtApprovalInProgress] = useState(false);
  const [machineApprovalConfirmed, setMachineApprovalConfirmed] = useState(false);
  const [showMachineRiskModal, setShowMachineRiskModal] = useState(false);

  // 首页面板：交易池储备 & 奖励池积累
  const [historyToken, setHistoryToken] = useState<TokenType | null>(null);
  const [ordersTokenTab, setOrdersTokenTab] = useState<TokenType>("ICO");
  const [tokenInOutRecords, setTokenInOutRecords] = useState<Record<TokenType, TxRecord[]>>({
    ICO: [],
    LIGHT: [],
    USDT: [],
  });
  const [loadingTokenInOutRecords, setLoadingTokenInOutRecords] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);

  const readonlyProvider = useMemo(
    () => new FallbackProvider(
      CNC_MAINNET_RPC_URLS.map((url, index) => ({
        provider: new JsonRpcProvider(url, CNC_MAINNET_CHAIN_ID, {
          staticNetwork: true,
          batchMaxCount: 1,
          polling: true,
          pollingInterval: 4_000,
        }),
        priority: index + 1,
        stallTimeout: 800,
        weight: 1,
      })),
      CNC_MAINNET_CHAIN_ID,
      {
        quorum: 1,
        eventQuorum: 1,
        eventWorkers: 1,
      },
    ),
    [],
  );
  const [top3Leaderboard, setTop3Leaderboard] = useState<{ address: string; volume: bigint; rank: number }[]>([]);
  const [primaryPoolReserve, setPrimaryPoolReserve] = useState<{ ico: bigint; usdt: bigint }>({ ico: 0n, usdt: 0n });
  const [lightPoolReserve, setLightPoolReserve] = useState<{ light: bigint; ico: bigint }>({ light: 0n, ico: 0n });
  const [superNodePoolBalance, setSuperNodePoolBalance] = useState<bigint>(0n);
  const [nodePoolBalance, setNodePoolBalance] = useState<bigint>(0n);
  const [platformPoolBalance, setPlatformPoolBalance] = useState<bigint>(0n);
  const [leaderboardPoolBalance, setLeaderboardPoolBalance] = useState<bigint>(0n);
  const [machineOrderCount, setMachineOrderCount] = useState(0);
  const [orders, setOrders] = useState<MachineOrder[]>([]);
  const [rewardRecords, setRewardRecords] = useState<RewardRecord[]>([]);
  const [teamStats, setTeamStats] = useState<TeamStats>({
    directCount: 0n,
    teamCount: 0n,
    directVolume: 0n,
    teamVolume: 0n,
  });
  const [myReferrer, setMyReferrer] = useState("");
  const [directReferrals, setDirectReferrals] = useState<string[]>([]);

  const [identityId, setIdentityId] = useState<bigint | null>(null);
  const [identityApproved, setIdentityApproved] = useState(false);
  const [newOtcPrice, setNewOtcPrice] = useState("100");
  const [activeOrders, setActiveOrders] = useState<OtcOrder[]>([]);
  const [otcFeeBps, setOtcFeeBps] = useState(0);
  const [lastNodeTradePrice, setLastNodeTradePrice] = useState<bigint>(0n);
  const [lastSuperTradePrice, setLastSuperTradePrice] = useState<bigint>(0n);

  const [swapDirection, setSwapDirection] = useState<SwapDirection>("forward");
  const [swapSubTab, setSwapSubTab] = useState<SwapSubTab>("primary");

  // Derive pairId and direction from swap sub-tab
  const isSwapTab = activeTab === "swap";
  const activePairId = swapSubTab === "light" ? LIGHT_ICO_PAIR_ID : 0;
  const activeSwapDirection: SwapDirection = swapSubTab === "light" ? "forward" : swapDirection;
  const [swapAmountIn, setSwapAmountIn] = useState("10");
  const [swapSlippageBps, setSwapSlippageBps] = useState(200);
  const [swapTokenInAddress, setSwapTokenInAddress] = useState("");
  const [swapTokenOutAddress, setSwapTokenOutAddress] = useState("");
  const [swapTokenInSymbol, setSwapTokenInSymbol] = useState("-");
  const [swapTokenOutSymbol, setSwapTokenOutSymbol] = useState("-");
  const [swapTokenInDecimals, setSwapTokenInDecimals] = useState(6);
  const [swapTokenOutDecimals, setSwapTokenOutDecimals] = useState(18);
  const [swapPoolFeeBps, setSwapPoolFeeBps] = useState(0);
  const [swapPoolImpactLimitBps, setSwapPoolImpactLimitBps] = useState(0);
  const [swapTokenInBalance, setSwapTokenInBalance] = useState<bigint>(0n);
  const [swapTokenInAllowance, setSwapTokenInAllowance] = useState<bigint>(0n);
  const [swapQuoteOut, setSwapQuoteOut] = useState<bigint>(0n);
  const [swapQuoteFee, setSwapQuoteFee] = useState<bigint>(0n);
  const [swapQuoteImpactBps, setSwapQuoteImpactBps] = useState(0);

  const [loading, setLoading] = useState(false);

  // 处理邀请链接逻辑
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get("ref");
    if (ref && isAddress(ref)) {
      setMachineReferrer(ref);
      setReferrerSource("link");
    }
  }, []);

  useEffect(() => {
    void (async () => {
      if (referrerSource !== "none" || machineReferrer) {
        return;
      }

      const params = new URLSearchParams(window.location.search);
      const ref = params.get("ref");
      if (ref && isAddress(ref)) {
        return;
      }

      if (!window.ethereum) {
        return;
      }

      try {
        const readProvider = new BrowserProvider(window.ethereum);
        const owner = await getContractOwner(readProvider);
        if (owner && isAddress(owner)) {
          setContractOwner(owner);
          if (!address || owner.toLowerCase() !== address.toLowerCase()) {
            setMachineReferrer(owner);
            setReferrerSource("owner");
          }
        }
      } catch {
        // ignore prefill errors
      }
    })();
  }, [address, machineReferrer, referrerSource]);

  const resetWalletState = () => {
    setAddress("");
    setChainId(0);
    setProvider(null);
    setRole(0);
    setUsdtBalance(0n);
    setCoreAllowance(0n);
    setOtcAllowance(0n);
    setMachineOrderCount(0);
    setOrders([]);
    setRewardRecords([]);
    setMyReferrer("");
    setDirectReferrals([]);
    setIdentityId(null);
    setIdentityApproved(false);
    setActiveOrders([]);
    setSwapTokenInAddress("");
    setSwapTokenOutAddress("");
    setSwapTokenInSymbol("-");
    setSwapTokenOutSymbol("-");
    setSwapTokenInBalance(0n);
    setSwapTokenInAllowance(0n);
    setSwapQuoteOut(0n);
    setSwapQuoteFee(0n);
    setSwapQuoteImpactBps(0);
    setTokenInOutRecords({ ICO: [], LIGHT: [], USDT: [] });
    setLoadingTokenInOutRecords(false);
    setReferrerSource("none");
  };

  const refreshPublicData = async () => {
    // Reuse existing read helpers with a read-only JSON-RPC provider.
    const readProvider = readonlyProvider as unknown as BrowserProvider;

    try {
      const [nextMachinePrice, nextNodePrice, nextSuperPrice] = await Promise.all([
        getMachineUnitPrice(readProvider),
        getNodePrice(readProvider),
        getSuperNodePrice(readProvider),
      ]);
      setMachinePrice(nextMachinePrice);
      setNodePrice(nextNodePrice);
      setSuperPrice(nextSuperPrice);
    } catch (e) {
      console.error("Failed to fetch public price data", e);
    }

    try {
      const [poolsInfo, accBalances] = await Promise.all([
        SWAP_POOL_ADDRESS ? getSwapPoolsInfo(readProvider) : null,
        getPoolAccumulatedBalances(readProvider),
      ]);
      if (poolsInfo) {
        setPrimaryPoolReserve({ usdt: poolsInfo.primaryPool.reserve0, ico: poolsInfo.primaryPool.reserve1 });
        setLightPoolReserve({ light: poolsInfo.lightPool.reserve0, ico: poolsInfo.lightPool.reserve1 });
      }
      setSuperNodePoolBalance(accBalances.superNodePool);
      setNodePoolBalance(accBalances.nodePool);
      setPlatformPoolBalance(accBalances.platformPool);
      setLeaderboardPoolBalance(accBalances.leaderboardPool);
    } catch (e) {
      console.error("Failed to fetch public pool data", e);
    }

    try {
      const dayId = currentDayId();
      const lbData = await fetchLeaderboardDay(readProvider, dayId);
      setTop3Leaderboard(lbData.top10.slice(0, 3).map((entry) => ({
        address: entry.address,
        volume: entry.totalVolume,
        rank: entry.rank,
      })));
    } catch (e) {
      console.error("Failed to fetch public leaderboard", e);
    }

    try {
      const owner = await getContractOwner(readProvider);
      setContractOwner(owner);
    } catch (e) {
      console.error("Failed to fetch contract owner", e);
    }
  };

  const networkLabel = useMemo(() => {
    if (!chainId) return t.notConnected;
    return isOnCncMainnet(chainId) ? CNC_MAINNET_CHAIN_NAME : `${t.wrongNetwork} (chainId=${chainId})`;
  }, [chainId, t.notConnected, t.wrongNetwork]);

  const isWrongNetwork = useMemo(() => Boolean(chainId) && !isOnCncMainnet(chainId), [chainId]);

  const isConnected = Boolean(address && provider);

  useEffect(() => {
    if (!isConnected) {
      return;
    }

    let hasCompletedGuide = false;
    try {
      hasCompletedGuide = window.localStorage.getItem(FIRST_CONNECT_GUIDE_DONE_KEY) === "1";
    } catch {
      hasCompletedGuide = false;
    }

    if (!hasCompletedGuide) {
      setShowFirstConnectGuide(true);
    }
  }, [isConnected]);

  const machineTotal = useMemo(() => machinePrice * BigInt(machineQty || 0), [machinePrice, machineQty]);
  const roleLabel = useMemo(() => (role === 2 ? t.roleSuperNode : role === 1 ? t.roleNode : t.roleUser), [role, t.roleNode, t.roleSuperNode, t.roleUser]);
  const trimmedMachineReferrer = useMemo(() => machineReferrer.trim(), [machineReferrer]);
  const hasInvalidManualReferrer = useMemo(
    () => Boolean(trimmedMachineReferrer && !isAddress(trimmedMachineReferrer)),
    [trimmedMachineReferrer],
  );
  const isSelfReferrer = useMemo(
    () => Boolean(address && trimmedMachineReferrer && trimmedMachineReferrer.toLowerCase() === address.toLowerCase()),
    [address, trimmedMachineReferrer],
  );
  const hasBoundReferrer = useMemo(
    () => referrerSource === "onchain" && Boolean(machineReferrer && isAddress(machineReferrer)),
    [machineReferrer, referrerSource],
  );
  const referrerCandidate = useMemo(() => {
    if (!address) return "";

    const manualReferrer = trimmedMachineReferrer;
    if (manualReferrer && isAddress(manualReferrer) && manualReferrer.toLowerCase() !== address.toLowerCase()) {
      return manualReferrer;
    }

    if (contractOwner && isAddress(contractOwner) && contractOwner.toLowerCase() !== address.toLowerCase()) {
      return contractOwner;
    }

    return "";
  }, [address, contractOwner, trimmedMachineReferrer]);
  const defaultReferrerCandidate = useMemo(() => {
    if (!address) return "";
    if (contractOwner && isAddress(contractOwner) && contractOwner.toLowerCase() !== address.toLowerCase()) {
      return contractOwner;
    }
    return "";
  }, [address, contractOwner]);
  const hasEffectiveReferrer = useMemo(
    () => (hasBoundReferrer || Boolean(referrerCandidate)),
    [hasBoundReferrer, referrerCandidate],
  );
  const referrerSourceLabel = useMemo(() => {
    if (referrerSource === "link") return t.referrerFromLink;
    if (referrerSource === "onchain") return t.referrerFromChain;
    if (referrerSource === "owner") return t.referrerFromOwner;
    if (referrerSource === "manual") return t.referrerFromManual;
    return "";
  }, [referrerSource, t.referrerFromChain, t.referrerFromLink, t.referrerFromManual, t.referrerFromOwner]);
  const machineDisabledReason = useMemo(() => {
    if (!isConnected) return t.needConnectToBuy;
    if (isWrongNetwork) return t.needCncMainnetToBuy;
    return "";
  }, [isConnected, isWrongNetwork, t.needCncMainnetToBuy, t.needConnectToBuy]);
  const machineActionHint = useMemo(() => {
    if (machineDisabledReason) {
      return machineDisabledReason;
    }
    if (!hasEffectiveReferrer) {
      return t.needReferrerToBuy;
    }
    return "";
  }, [hasEffectiveReferrer, machineDisabledReason, t.needReferrerToBuy]);
  const nodeDisabledReason = useMemo(() => {
    if (!isConnected) return t.needConnectToBuy;
    if (isWrongNetwork) return t.needCncMainnetToBuy;
    if (!hasEffectiveReferrer) return t.needReferrerToBuy;
    if (role !== 0) return t.roleMismatchForNode;
    return "";
  }, [hasEffectiveReferrer, isConnected, isWrongNetwork, role, t.needCncMainnetToBuy, t.needConnectToBuy, t.needReferrerToBuy, t.roleMismatchForNode]);
  const superDisabledReason = useMemo(() => {
    if (!isConnected) return t.needConnectToBuy;
    if (isWrongNetwork) return t.needCncMainnetToBuy;
    if (!hasEffectiveReferrer) return t.needReferrerToBuy;
    if (role === 2) return t.alreadySuperNode;
    return "";
  }, [hasEffectiveReferrer, isConnected, isWrongNetwork, role, t.needCncMainnetToBuy, t.needConnectToBuy, t.needReferrerToBuy, t.alreadySuperNode]);
  const bindReferrerDisabledReason = useMemo(() => {
    if (!isConnected) return t.connectFirst;
    if (isWrongNetwork) return t.switchCncMainnet;
    return "";
  }, [isConnected, isWrongNetwork, t.connectFirst, t.switchCncMainnet]);
  const bindReferrerHint = useMemo(() => {
    if (bindReferrerDisabledReason) return bindReferrerDisabledReason;
    if (hasInvalidManualReferrer) return t.invalidReferrer;
    if (isSelfReferrer) return t.selfReferrerFallback;
    return "";
  }, [bindReferrerDisabledReason, hasInvalidManualReferrer, isSelfReferrer, t.invalidReferrer, t.selfReferrerFallback]);
  const purchaseFlow = useMemo(
    () => [
      { label: t.stepConnect, done: isConnected },
      { label: t.stepReferrer, done: hasEffectiveReferrer },
      { label: t.stepApprove, done: coreAllowance >= machineTotal && machineTotal > 0n },
      { label: t.stepPurchase, done: false },
    ],
    [coreAllowance, hasEffectiveReferrer, isConnected, machineTotal, t.stepApprove, t.stepConnect, t.stepPurchase, t.stepReferrer],
  );
  const swapAmountRaw = useMemo(() => {
    try {
      if (!swapAmountIn.trim() || Number(swapAmountIn) <= 0) return 0n;
      return parseTokenAmount(swapAmountIn, swapTokenInDecimals);
    } catch {
      return null;
    }
  }, [swapAmountIn, swapTokenInDecimals]);
  const swapHasEnoughBalance = useMemo(() => {
    if (swapAmountRaw === null) return false;
    return swapAmountRaw <= swapTokenInBalance;
  }, [swapAmountRaw, swapTokenInBalance]);
  const swapHasEnoughAllowance = useMemo(() => {
    if (swapAmountRaw === null) return false;
    return swapAmountRaw <= swapTokenInAllowance;
  }, [swapAmountRaw, swapTokenInAllowance]);
  const swapStatusText = useMemo(() => {
    if (swapAmountRaw === null || swapAmountRaw === 0n) return t.quoteNeedAmount;
    if (!swapHasEnoughBalance) return t.quoteInsufficientBalance;
    if (!swapHasEnoughAllowance) return t.quoteNeedApproval;
    return t.quoteReady;
  }, [swapAmountRaw, swapHasEnoughAllowance, swapHasEnoughBalance, t.quoteInsufficientBalance, t.quoteNeedAmount, t.quoteNeedApproval, t.quoteReady]);
  const swapImpactTone = useMemo(() => {
    if (swapQuoteImpactBps >= 800) return "high";
    if (swapQuoteImpactBps >= 300) return "medium";
    return "low";
  }, [swapQuoteImpactBps]);
  const swapImpactLabel = useMemo(() => {
    if (swapQuoteImpactBps >= 800) return t.highImpact;
    if (swapQuoteImpactBps >= 300) return t.mediumImpact;
    return t.lowImpact;
  }, [swapQuoteImpactBps, t.highImpact, t.lowImpact, t.mediumImpact]);
  const isOwner = useMemo(
    () => Boolean(address && contractOwner && address.toLowerCase() === contractOwner.toLowerCase()),
    [address, contractOwner],
  );
  const getRoleLabelByValue = (roleValue: number) => (roleValue === 2 ? t.roleSuperNode : roleValue === 1 ? t.roleNode : t.roleUser);
  const visibleDesktopTabs = useMemo(() => {
    const tabs = [...DESKTOP_TABS];
    if (isOwner) {
      tabs.push({ key: "admin" as TabKey, label: t.tab_admin });
    }
    return tabs;
  }, [isOwner, t.tab_admin]);
  const visibleMobileTabs = useMemo(() => {
    const tabs = [...MOBILE_TABS];
    if (isOwner) {
      tabs.push({ key: "admin" as TabKey, label: t.tab_admin });
    }
    return tabs;
  }, [isOwner, t.tab_admin]);

  useEffect(() => {
    if (!isOwner) {
      setActiveTab((current) => (current === "admin" ? "overview" : current));
    }
  }, [isOwner]);

  const effectiveSwapDirection = useMemo<SwapDirection>(
    () => activeSwapDirection,
    [activeSwapDirection],
  );
  const swapApprovalStatus = useMemo(() => {
    if (swapAmountRaw === null || swapAmountRaw === 0n) return t.quoteNeedAmount;
    return swapHasEnoughAllowance ? t.approved : t.notApproved;
  }, [swapAmountRaw, swapHasEnoughAllowance, t.approved, t.notApproved, t.quoteNeedAmount]);
  const poolToken0Name = useMemo(() => (activePairId === LIGHT_ICO_PAIR_ID ? "LIGHT" : "USDT"), [activePairId]);
  const poolToken1Name = useMemo(() => "ICO", []);
  const swapRouteLabel = useMemo(() => {
    const input = swapTokenInSymbol === "-" ? (effectiveSwapDirection === "forward" ? poolToken0Name : poolToken1Name) : swapTokenInSymbol;
    const output = swapTokenOutSymbol === "-" ? (effectiveSwapDirection === "forward" ? poolToken1Name : poolToken0Name) : swapTokenOutSymbol;
    return `${input} -> ${output}`;
  }, [effectiveSwapDirection, poolToken0Name, poolToken1Name, swapTokenInSymbol, swapTokenOutSymbol]);
  const swapCanExecute = useMemo(() => {
    if (loading || swapQuoteOut <= 0n || swapAmountRaw === null || swapAmountRaw === 0n) return false;
    return swapHasEnoughBalance && swapHasEnoughAllowance;
  }, [loading, swapAmountRaw, swapHasEnoughAllowance, swapHasEnoughBalance, swapQuoteOut]);
  const swapFlow = useMemo(
    () => [
      { label: t.swapStepAmount, done: swapAmountRaw !== null && swapAmountRaw > 0n },
      { label: t.swapStepApprove, done: swapAmountRaw !== null && swapAmountRaw > 0n && swapHasEnoughAllowance },
      { label: t.swapStepExecute, done: swapCanExecute },
    ],
    [swapAmountRaw, swapCanExecute, swapHasEnoughAllowance, t.swapStepAmount, t.swapStepApprove, t.swapStepExecute],
  );
  const swapPrimaryActionLabel = useMemo(() => {
    if (swapAmountRaw === null || swapAmountRaw === 0n) return t.executeSwap;
    return swapHasEnoughAllowance ? t.executeSwap : t.approveToken;
  }, [swapAmountRaw, swapHasEnoughAllowance, t.approveToken, t.executeSwap]);
  const swapPrimaryActionHint = useMemo(() => {
    if (swapAmountRaw === null || swapAmountRaw === 0n) return t.swapActionWaitHint;
    if (swapQuoteOut <= 0n) return t.swapNeedQuoteHint;
    return swapHasEnoughAllowance ? t.swapActionExecuteHint : t.swapActionApproveHint;
  }, [swapAmountRaw, swapHasEnoughAllowance, swapQuoteOut, t.swapActionApproveHint, t.swapActionExecuteHint, t.swapActionWaitHint, t.swapNeedQuoteHint]);
  const swapCanApprove = useMemo(() => {
    if (loading || swapAmountRaw === null || swapAmountRaw === 0n) return false;
    if (swapHasEnoughAllowance || !swapTokenInAddress) return false;
    return swapHasEnoughBalance;
  }, [loading, swapAmountRaw, swapHasEnoughAllowance, swapHasEnoughBalance, swapTokenInAddress]);
  const onSwapPrimaryAction = () => {
    if (swapAmountRaw === null || swapAmountRaw === 0n) {
      setStatus(t.quoteNeedAmount);
      return;
    }
    if (!swapHasEnoughAllowance) {
      void onApproveSwapToken();
      return;
    }
    void onSwapExecute();
  };
  const recentMachineUnits = useMemo(
    () => orders.reduce((sum, order) => sum + toSafeBigInt(order.quantity), 0n),
    [orders],
  );
  const recentMachineAmount = useMemo(
    () => orders.reduce((sum, order) => sum + toSafeBigInt(order.amountUSDT), 0n),
    [orders],
  );
  const recentRewardAmount = useMemo(
    () => rewardRecords.reduce((sum, row) => sum + toSafeBigInt(row.amountUSDT), 0n),
    [rewardRecords],
  );
  const selectedTokenOrders = useMemo(
    () => (tokenInOutRecords[ordersTokenTab] ?? []).slice(0, INOUT_PREVIEW_LIMIT),
    [ordersTokenTab, tokenInOutRecords],
  );
  const formatTokenInOutAmount = (record: TxRecord) => {
    if (record.token === "USDT") {
      return formatUsdt(record.amount);
    }
    return formatTokenAmount(record.amount, 18);
  };
  const formatTokenInOutTime = (timestamp: number) => {
    if (!timestamp) {
      return "-";
    }
    return new Date(timestamp * 1000).toLocaleString(lang === "zh" ? "zh-CN" : "en-US");
  };

  useEffect(() => {
    if (activePairId === LIGHT_ICO_PAIR_ID && swapDirection !== "forward") {
      setSwapDirection("forward");
    }
  }, [swapDirection, activePairId]);

  useEffect(() => {
    void (async () => {
      try {
        setAnnouncements(await fetchPublishedAnnouncements());
      } catch {
        setAnnouncements([]);
      }
    })();
  }, []);

  const refreshSwapPanel = async (
    connectedProvider: BrowserProvider,
    wallet: string,
    pairId = activePairId,
    direction = activeSwapDirection,
    amountInput = swapAmountIn,
  ) => {
    const isLightPair = pairId === LIGHT_ICO_PAIR_ID;
    const activeDirection = isLightPair ? "forward" : direction;

    if (!isLightPair) {
      const { tokenIn, tokenOut } = resolvePrimarySwapTokens(activeDirection);
      const primarySpender = getPrimarySwapSpender();
      const [tokenInMeta, tokenOutMeta, tokenInBalance, tokenInAllowance] = await Promise.all([
        getTokenMeta(connectedProvider, tokenIn),
        getTokenMeta(connectedProvider, tokenOut),
        getTokenBalance(connectedProvider, tokenIn, wallet),
        getTokenAllowance(connectedProvider, tokenIn, wallet, primarySpender),
      ]);

      setSwapTokenInAddress(tokenIn);
      setSwapTokenOutAddress(tokenOut);
      setSwapTokenInSymbol(tokenInMeta.symbol);
      setSwapTokenOutSymbol(tokenOutMeta.symbol);
      setSwapTokenInDecimals(tokenInMeta.decimals);
      setSwapTokenOutDecimals(tokenOutMeta.decimals);
      setSwapTokenInBalance(tokenInBalance);
      setSwapTokenInAllowance(tokenInAllowance);
      setSwapPoolFeeBps(Math.floor(PANCAKE_V3_PRIMARY_FEE_PPM / 100));
      setSwapPoolImpactLimitBps(0);
      setSwapSlippageBps(Math.max(50, Math.floor(PANCAKE_V3_PRIMARY_FEE_PPM / 100)));

      if (!amountInput.trim() || Number(amountInput) <= 0) {
        setSwapQuoteOut(0n);
        setSwapQuoteFee(0n);
        setSwapQuoteImpactBps(0);
        return;
      }

      const amountInRaw = parseTokenAmount(amountInput, tokenInMeta.decimals);
      const quote = await quotePrimarySwapExactIn(connectedProvider, activeDirection, amountInRaw);
      setSwapQuoteOut(quote.amountOut);
      setSwapQuoteFee(quote.fee);
      setSwapQuoteImpactBps(quote.priceImpactBps);
      return;
    }

    if (!SWAP_POOL_ADDRESS) return;

    const pool = await getSwapPool(connectedProvider, pairId);
    if (!pool.exists) {
      setSwapQuoteOut(0n);
      setSwapQuoteFee(0n);
      setSwapQuoteImpactBps(0);
      return;
    }

    const tokenInAddress = activeDirection === "forward" ? pool.token0 : pool.token1;
    const tokenOutAddress = activeDirection === "forward" ? pool.token1 : pool.token0;

    const [tokenInMeta, tokenOutMeta, tokenInBalance, tokenInAllowance] = await Promise.all([
      getTokenMeta(connectedProvider, tokenInAddress),
      getTokenMeta(connectedProvider, tokenOutAddress),
      getTokenBalance(connectedProvider, tokenInAddress, wallet),
      getTokenAllowance(connectedProvider, tokenInAddress, wallet, SWAP_POOL_ADDRESS),
    ]);

    setSwapTokenInAddress(tokenInAddress);
    setSwapTokenOutAddress(tokenOutAddress);
    setSwapTokenInSymbol(tokenInMeta.symbol);
    setSwapTokenOutSymbol(tokenOutMeta.symbol);
    setSwapTokenInDecimals(tokenInMeta.decimals);
    setSwapTokenOutDecimals(tokenOutMeta.decimals);
    setSwapTokenInBalance(tokenInBalance);
    setSwapTokenInAllowance(tokenInAllowance);
    setSwapPoolFeeBps(pool.feeBps);
    setSwapPoolImpactLimitBps(pool.maxPriceImpactBps);
    setSwapSlippageBps(pool.feeBps);

    if (!amountInput.trim() || Number(amountInput) <= 0) {
      setSwapQuoteOut(0n);
      setSwapQuoteFee(0n);
      setSwapQuoteImpactBps(0);
      return;
    }

    const amountInRaw = parseTokenAmount(amountInput, tokenInMeta.decimals);
    const quote = await quoteSwapExactIn(connectedProvider, pairId, tokenInAddress, amountInRaw);
    setSwapQuoteOut(quote.amountOut);
    setSwapQuoteFee(quote.fee);
    setSwapQuoteImpactBps(quote.priceImpactBps);
  };

  const refreshAll = async (connectedProvider: BrowserProvider, wallet: string) => {
    let nextMachinePrice: bigint | undefined;
    let nextNodePrice: bigint | undefined;
    let nextSuperPrice: bigint | undefined;
    let nextRole: number | undefined;
    let balance: bigint | undefined;
    let allowanceCore: bigint | undefined;
    let allowanceOtc: bigint | undefined;
    try {
      [nextMachinePrice, nextNodePrice, nextSuperPrice, nextRole, balance, allowanceCore, allowanceOtc] = await Promise.all([
        getMachineUnitPrice(connectedProvider),
        getNodePrice(connectedProvider),
        getSuperNodePrice(connectedProvider),
        getUserRole(connectedProvider, wallet),
        getUsdtBalance(connectedProvider, wallet),
        CORE_CONTRACT_ADDRESS ? getUsdtAllowance(connectedProvider, wallet, CORE_CONTRACT_ADDRESS) : Promise.resolve(0n),
        OTC_CONTRACT_ADDRESS ? getUsdtAllowance(connectedProvider, wallet, OTC_CONTRACT_ADDRESS) : Promise.resolve(0n),
      ]);
    } catch (e) {
      console.error("Failed to fetch core chain data", e);
    }

    if (nextMachinePrice !== undefined) setMachinePrice(nextMachinePrice);
    if (nextNodePrice !== undefined) setNodePrice(nextNodePrice);
    if (nextSuperPrice !== undefined) setSuperPrice(nextSuperPrice);
    if (nextRole !== undefined) setRole(nextRole);
    if (balance !== undefined) setUsdtBalance(balance);
    if (allowanceCore !== undefined) setCoreAllowance(allowanceCore);
    if (allowanceOtc !== undefined) setOtcAllowance(allowanceOtc);

    // 首页池面板数据（不依赖登录钱包，任意 provider 即可）
    try {
      const [poolsInfo, accBalances] = await Promise.all([
        SWAP_POOL_ADDRESS ? getSwapPoolsInfo(connectedProvider) : null,
        getPoolAccumulatedBalances(connectedProvider),
      ]);
      if (poolsInfo) {
        // pairId 0: token0=USDT token1=ICO
        setPrimaryPoolReserve({ usdt: poolsInfo.primaryPool.reserve0, ico: poolsInfo.primaryPool.reserve1 });
        // pairId 1: token0=LIGHT token1=ICO
        setLightPoolReserve({ light: poolsInfo.lightPool.reserve0, ico: poolsInfo.lightPool.reserve1 });
      }
      setSuperNodePoolBalance(accBalances.superNodePool);
      setNodePoolBalance(accBalances.nodePool);
      setPlatformPoolBalance(accBalances.platformPool);
      setLeaderboardPoolBalance(accBalances.leaderboardPool);
    } catch (e) {
      console.error("Failed to fetch pool panel data", e);
    }

    // Fetch today's top 3 leaderboard
    try {
      const dayId = currentDayId();
      const lbData = await fetchLeaderboardDay(connectedProvider, dayId);
      setTop3Leaderboard(lbData.top10.slice(0, 3).map(e => ({
        address: e.address,
        volume: e.totalVolume,
        rank: e.rank,
      })));
    } catch (e) {
      console.error("Failed to fetch leaderboard top3", e);
    }

    // 团队统计
    try {
      const stats = await getTeamStats(connectedProvider, wallet);
      setTeamStats(stats);
    } catch (e) {
      console.error("Failed to fetch user stats", e);
    }

    try {
      const referrals = await getDirectReferralsByReferrer(connectedProvider, wallet, 100);
      setDirectReferrals(referrals);
    } catch (e) {
      console.error("Failed to fetch direct referrals", e);
      setDirectReferrals([]);
    }

    // 合约 Owner 与推荐人状态（单独 try/catch，失败不影响整体刷新）
    try {
      const owner = await getContractOwner(connectedProvider);
      setContractOwner(owner);

      const currentReferrer = await getReferrer(connectedProvider, wallet);
      const zeroAddr = "0x0000000000000000000000000000000000000000";
      if (!currentReferrer || currentReferrer === zeroAddr) {
        setMyReferrer("");
        // 未绑定：检查 URL 参数 → 默认 Owner
        const params = new URLSearchParams(window.location.search);
        const urlRef = params.get("ref");
        if (urlRef && isAddress(urlRef) && urlRef.toLowerCase() !== wallet.toLowerCase()) {
          setMachineReferrer(urlRef);
          setReferrerSource("link");
        } else if (owner && isAddress(owner) && owner.toLowerCase() !== wallet.toLowerCase()) {
          setMachineReferrer(owner);
          setReferrerSource("owner");
        } else {
          setMachineReferrer("");
          setReferrerSource("manual");
        }
      } else {
        // 已绑定：同步链上状态
        setMyReferrer(currentReferrer);
        setMachineReferrer(currentReferrer);
        setReferrerSource("onchain");
      }
    } catch (e) {
      console.error("Failed to fetch owner / referrer", e);
    }

    // 算力订单
    try {
      const orderIds = await getUserMachineOrderIds(connectedProvider, wallet);
      setMachineOrderCount(orderIds.length);
      const nextOrders = await Promise.all(orderIds.slice(Math.max(0, orderIds.length - 8)).map((id) => getMachineOrder(connectedProvider, id)));
      setOrders(
        nextOrders.reverse().map((order) => ({
          ...order,
          quantity: toSafeBigInt(order.quantity),
          amountUSDT: toSafeBigInt(order.amountUSDT),
          createdAt: toSafeBigInt(order.createdAt) * 1000n,
        })),
      );
    } catch (e) {
      console.error("Failed to fetch machine orders", e);
    }

    // 代币出入金记录（按 ICO/LIGHT/USDT 分组）
    try {
      setLoadingTokenInOutRecords(true);
      const latestBlock = await connectedProvider.getBlockNumber();
      const lookbackBlocks = Math.ceil((INOUT_LOOKBACK_DAYS * 24 * 60 * 60) / 3);
      const fromBlock = Math.max(0, latestBlock - lookbackBlocks);
      const refs = {
        core: (CORE_CONTRACT_ADDRESS || "").toLowerCase(),
        swap: (SWAP_POOL_ADDRESS || "").toLowerCase(),
        otc: (OTC_CONTRACT_ADDRESS || "").toLowerCase(),
      };

      const tokenConfigs: Array<{ token: TokenType; address?: string }> = [
        { token: "ICO", address: ICO_TOKEN_ADDRESS },
        { token: "LIGHT", address: LIGHT_TOKEN_ADDRESS },
        { token: "USDT", address: USDT_CONTRACT_ADDRESS },
      ];

      const grouped = await Promise.all(
        tokenConfigs.map(async ({ token, address }) => {
          if (!address) {
            return { token, records: [] as TxRecord[] };
          }
          const records = await fetchTokenHistory(
            connectedProvider,
            address,
            wallet,
            token,
            refs,
            fromBlock,
            latestBlock,
          );
          return { token, records };
        }),
      );

      const nextTokenRecords: Record<TokenType, TxRecord[]> = {
        ICO: [],
        LIGHT: [],
        USDT: [],
      };
      grouped.forEach(({ token, records }) => {
        nextTokenRecords[token] = records;
      });
      setTokenInOutRecords(nextTokenRecords);
    } catch (e) {
      console.error("Failed to fetch token in/out records", e);
      setTokenInOutRecords({ ICO: [], LIGHT: [], USDT: [] });
    } finally {
      setLoadingTokenInOutRecords(false);
    }

    // 奖励记录
    try {
      const nextRewardRecords = await getRewardRecordsByBeneficiary(connectedProvider, wallet, 12);
      setRewardRecords(
        nextRewardRecords.map((record) => ({
          ...record,
          orderId: toSafeBigInt(record.orderId),
          amountUSDT: toSafeBigInt(record.amountUSDT),
        })),
      );
    } catch (error) {
      console.error("Failed to fetch reward records", error);
      setRewardRecords([]);
    }

    // 身份 ID
    try {
      const nextIdentityId = await getTokenOfOwner(connectedProvider, wallet);
      setIdentityId(nextIdentityId);
      setIdentityApproved(nextIdentityId && OTC_CONTRACT_ADDRESS ? await isIdentityApproved(connectedProvider, nextIdentityId, OTC_CONTRACT_ADDRESS) : false);
    } catch (e) {
      console.error("Failed to fetch identity", e);
    }

    // OTC 挂单
    if (OTC_CONTRACT_ADDRESS) {
      try {
        const [ids, nextOtcFeeBps, nextNodeLastTrade, nextSuperLastTrade] = await Promise.all([
          getActiveOrderIds(connectedProvider),
          getOtcFeeBps(connectedProvider),
          getLastTradePriceByRole(connectedProvider, 1),
          getLastTradePriceByRole(connectedProvider, 2),
        ]);
        const nextActiveOrders = await Promise.all(ids.slice(0, 20).map((id) => getOrder(connectedProvider, id)));
        setOtcFeeBps(nextOtcFeeBps);
        setLastNodeTradePrice(nextNodeLastTrade);
        setLastSuperTradePrice(nextSuperLastTrade);
        setActiveOrders(nextActiveOrders.filter((row) => row.active));
      } catch (e) {
        console.error("Failed to fetch OTC orders", e);
      }
    } else {
      setActiveOrders([]);
      setOtcFeeBps(0);
      setLastNodeTradePrice(0n);
      setLastSuperTradePrice(0n);
    }

    // Swap 面板（可选，失败不影响）
    try {
      await refreshSwapPanel(connectedProvider, wallet);
    } catch (e) {
      console.error("Failed to refresh swap panel", e);
    }
  };

  const syncWalletState = async (connectedProvider: BrowserProvider, wallet: string, nextChainId: number) => {
    setAddress(wallet);
    setChainId(nextChainId);
    setProvider(connectedProvider);
    await refreshAll(connectedProvider, wallet);
  };

  useEffect(() => {
    let disposed = false;

    const restoreConnection = async () => {
      try {
        const existing = await checkConnection();
        if (!existing) {
          if (!disposed) {
            resetWalletState();
          }
          return;
        }

        if (!disposed) {
          await syncWalletState(existing.provider, existing.address, existing.chainId);
          setStatus(langRef.current === "zh" ? "钱包连接成功，数据已同步。" : "Wallet connected and data synced.");
        }
      } catch (error) {
        if (!disposed) {
          setStatus(error instanceof Error ? error.message : (langRef.current === "zh" ? "连接钱包失败" : "Failed to connect wallet"));
        }
      }
    };

    const handleWalletUpdate = async () => {
      try {
        const existing = await checkConnection();
        if (!existing) {
          if (!disposed) {
            resetWalletState();
          }
          return;
        }

        if (!disposed) {
          await syncWalletState(existing.provider, existing.address, existing.chainId);
        }
      } catch (error) {
        if (!disposed) {
          setStatus(error instanceof Error ? error.message : (langRef.current === "zh" ? "连接钱包失败" : "Failed to connect wallet"));
        }
      }
    };

    void restoreConnection();

    const cleanup = listenToWalletEvents(
      () => {
        void handleWalletUpdate();
      },
      () => {
        void handleWalletUpdate();
      },
    );

    return () => {
      disposed = true;
      cleanup();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let disposed = false;

    const runRefresh = async () => {
      try {
        await refreshPublicData();
      } catch {
        // individual fetch segments already handle and log their own failures
      }
    };

    void runRefresh();

    const timer = window.setInterval(() => {
      if (!disposed) {
        void runRefresh();
      }
    }, 30_000);

    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readonlyProvider]);

  useEffect(() => {
    if (!isSwapTab || !provider || !address) {
      return;
    }

    const timer = window.setTimeout(() => {
      void refreshSwapPanel(provider, address, activePairId, activeSwapDirection, swapAmountIn).catch(() => {
        // Explicit button actions surface user-visible errors.
      });
    }, 350);

    return () => {
      window.clearTimeout(timer);
    };
  }, [isSwapTab, swapSubTab, address, provider, activePairId, activeSwapDirection, swapAmountIn]);

  const markFirstConnectGuideDone = () => {
    try {
      window.localStorage.setItem(FIRST_CONNECT_GUIDE_DONE_KEY, "1");
    } catch {
      // ignore storage write issues
    }
    setShowFirstConnectGuide(false);
  };

  const onRunFirstConnectGuide = async () => {
    if (!provider || !address) {
      setStatus(t.connectFirst);
      return;
    }

    try {
      setFirstConnectGuideRunning(true);
      setStatus(t.firstGuideRunning);

      const setupResult = await setupWalletAfterConnect();
      
      // Try to bind default referrer if not already bound and not an owner
      let bindResult = { success: false, message: "" };
      if (!isOwner && !hasBoundReferrer && defaultReferrerCandidate) {
        try {
          await bindReferrer(provider, defaultReferrerCandidate);
          setMachineReferrer(defaultReferrerCandidate);
          setReferrerSource("onchain");
          bindResult.success = true;
          bindResult.message = langRef.current === "zh" ? "已绑定默认推荐人。" : "Default referrer bound.";
        } catch (bindError) {
          // Referrer binding is optional in first guide, so we don't fail the setup
          bindResult.message = bindError instanceof Error ? bindError.message : (langRef.current === "zh" ? "推荐人绑定失败，请稍后重试。" : "Referrer binding failed, please retry later.");
        }
      }
      
      const existing = await checkConnection();
      if (existing) {
        await syncWalletState(existing.provider, existing.address, existing.chainId);
      }

      if (langRef.current === "zh") {
        const messages = [`首次引导完成：已配置 ${setupResult.addedTokenCount}/${setupResult.attemptedTokenCount} 个代币。`];
        if (bindResult.message) messages.push(bindResult.message);
        setStatus(messages.join(" "));
      } else {
        const messages = [`First-time setup completed: ${setupResult.addedTokenCount}/${setupResult.attemptedTokenCount} tokens configured.`];
        if (bindResult.message) messages.push(bindResult.message);
        setStatus(messages.join(" "));
      }
      markFirstConnectGuideDone();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t.walletConnectFailed);
    } finally {
      setFirstConnectGuideRunning(false);
    }
  };

  const onCopyInviteLink = async () => {
    if (!address) return;
    try {
      const url = `${window.location.origin}${window.location.pathname}?ref=${address}`;
      await navigator.clipboard.writeText(url);
      setStatus(t.linkCopied);
    } catch {
      setStatus(t.txFailed);
    }
  };

  const onAddProjectToken = async (symbol: "ICO" | "LIGHT") => {
    const tokenAddress = symbol === "ICO" ? ICO_TOKEN_ADDRESS : LIGHT_TOKEN_ADDRESS;
    if (!tokenAddress) {
      setStatus(`${symbol} ${t.tokenConfigMissing}`);
      return;
    }

    try {
      setAddingTokenSymbol(symbol);
      await navigator.clipboard.writeText(tokenAddress);
      setStatus(`${symbol} ${t.tokenAdded}`);
    } catch (error) {
      const fallback = error instanceof Error ? error.message : `${symbol} ${t.tokenAddFailed}`;
      setStatus(fallback);
    } finally {
      setAddingTokenSymbol(null);
    }
  };

  const onSetSwapMax = () => {
    setSwapAmountIn(formatTokenAmount(swapTokenInBalance, swapTokenInDecimals));
  };

  const onReverseSwapDirection = () => {
    if (activePairId === LIGHT_ICO_PAIR_ID || swapSubTab === "light") {
      return;
    }
    setSwapDirection((current) => (current === "forward" ? "reverse" : "forward"));
  };

  const onRefreshWallet = async () => {
    try {
      const existing = await checkConnection();
      if (!existing) {
        setStatus(t.connectFirst);
        return;
      }
      await ensureCncMainnetNetwork();
      await syncWalletState(existing.provider, existing.address, existing.chainId);
      setStatus(t.walletConnected);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t.walletConnectFailed);
    }
  };

  const guardedAction = async (action: () => Promise<void>) => {
    if (!provider || !address) {
      setStatus(t.connectFirst);
      return;
    }
    if (!isOnCncMainnet(chainId)) {
      setStatus(t.switchCncMainnet);
      return;
    }
    try {
      setLoading(true);
      await action();
    } catch (error) {
      setStatus(parseContractError(error, langRef.current));
      setLoading(false);
      return;
    }
    // Post-action refresh — run in the background so a refresh failure
    // does NOT overwrite the success status from action().
    try {
      await refreshAll(provider, address);
    } catch (e) {
      console.error("Post-action refresh failed", e);
    } finally {
      setLoading(false);
    }
  };

  const ensureUsdtApproval = async (spender: string, requiredAmount: bigint, currentAllowance: bigint, mode: "core" | "otc") => {
    if (currentAllowance >= requiredAmount) {
      return;
    }

    setStatus(`${t.autoApproveThenPay} ${mode === "core" ? t.approvingUsdtCore : t.approvingUsdtOtc}`);
    await approveUsdt(provider!, spender, parseUsdt("1000000000"));
    setStatus(mode === "core" ? t.approvedCoreSuccess : t.approvedOtcSuccess);
  };

  const ensureReferrerReady = async () => {
    if (!provider || !address) {
      throw new Error(t.connectFirst);
    }

    const zeroAddr = "0x0000000000000000000000000000000000000000";
    const currentReferrer = await getReferrer(provider, address);
    if (currentReferrer && currentReferrer !== zeroAddr) {
      setMachineReferrer(currentReferrer);
      setReferrerSource("onchain");
      return;
    }

    let candidate = referrerCandidate;
    if (!candidate) {
      try {
        const nextOwner = await getContractOwner(provider);
        if (nextOwner && isAddress(nextOwner) && nextOwner.toLowerCase() !== address.toLowerCase()) {
          candidate = nextOwner;
          setContractOwner(nextOwner);
        }
      } catch {
      }
    }

    if (!candidate) {
      throw new Error(t.needReferrerToBuy);
    }

    setStatus(t.bindingReferrer);
    await bindReferrer(provider, candidate);
    setMachineReferrer(candidate);
    setReferrerSource("onchain");
    setStatus(t.bindReferrerSuccess);
  };

  const onBuyMachine = async () => guardedAction(async () => {
    if (machineQty < 1 || machineQty > 10) throw new Error(t.invalidMachineQty);
    await ensureReferrerReady();
    if (!CORE_CONTRACT_ADDRESS) throw new Error(t.missingCoreConfig);
    if (usdtBalance < machineTotal) throw new Error(t.insufficientUsdtBalance);
    await ensureUsdtApproval(CORE_CONTRACT_ADDRESS, machineTotal, coreAllowance, "core");
    setStatus(t.buyingMachine);
    await purchaseMachine(provider!, machineQty);
    setStatus(t.buyMachineSuccess);
  });

  // P0-3: Two-step purchase flow
  const getMachineAllocationPreview = () => {
    const total = machineTotal;
    return {
      lpPool: (total * 60n) / 100n,
      referralPool: (total * 5n) / 100n,
      superNodePool: (total * 5n) / 100n,
      nodePool: (total * 8n) / 100n,
      platformPool: (total * 20n) / 100n,
      leaderboardPool: (total * 2n) / 100n,
    };
  };

  const onApproveUsdt = async () => guardedAction(async () => {
    if (!CORE_CONTRACT_ADDRESS) throw new Error(t.missingCoreConfig);
    if (usdtBalance < machineTotal) throw new Error(t.insufficientUsdtBalance);

    setUsdtApprovalInProgress(true);
    setStatus(t.autoApproveThenPay);

    try {
      await approveUsdt(provider!, CORE_CONTRACT_ADDRESS, parseUsdt("1000000000"));
      setMachineApprovalConfirmed(true);
      setStatus(t.approvedCoreSuccess);
    } finally {
      setUsdtApprovalInProgress(false);
    }
  });

  const onConfirmMachineRisk = async () => {
    setShowMachineRiskModal(false);
    await onPurchaseMachineOnly();
  };

  const onPurchaseMachineOnly = async () => guardedAction(async () => {
    if (machineQty < 1 || machineQty > 10) throw new Error(t.invalidMachineQty);
    await ensureReferrerReady();
    if (!CORE_CONTRACT_ADDRESS) throw new Error(t.missingCoreConfig);

    setStatus(t.buyingMachine);
    await purchaseMachine(provider!, machineQty);
    
    // Reset two-step flow after successful purchase
    setMachineApprovalConfirmed(false);
    setStatus(t.buyMachineSuccess);
  });

  const needsUsdtApproval = coreAllowance < machineTotal;

  const onBindReferrer = async () => guardedAction(async () => {
    if (!CORE_CONTRACT_ADDRESS) throw new Error(t.missingCoreConfig);

    if (hasBoundReferrer) {
      setStatus(t.referrerAlreadyBound);
      return;
    }

    if (hasInvalidManualReferrer) {
      throw new Error(t.invalidReferrer);
    }

    const referrer = referrerCandidate;
    if (!referrer) throw new Error(t.needReferrerToBuy);

    // 自邀请：自动切换为合约 Owner
    if (address && trimmedMachineReferrer && trimmedMachineReferrer.toLowerCase() === address.toLowerCase()) {
      if (!contractOwner || !isAddress(contractOwner) || contractOwner.toLowerCase() === address.toLowerCase()) {
        throw new Error(t.invalidSelfReferrer);
      }
    }

    setStatus(t.bindingReferrer);
    await bindReferrer(provider!, referrer);
    // 立即更新本地状态，避免依赖 refreshAll 时序
    setMachineReferrer(referrer);
    setReferrerSource("onchain");
    setStatus(t.bindReferrerSuccess);
  });

  const onBindDefaultReferrer = async () => guardedAction(async () => {
    if (!CORE_CONTRACT_ADDRESS) throw new Error(t.missingCoreConfig);

    if (hasBoundReferrer) {
      setStatus(t.referrerAlreadyBound);
      return;
    }

    if (!defaultReferrerCandidate) throw new Error(t.needReferrerToBuy);

    setStatus(t.bindingReferrer);
    await bindReferrer(provider!, defaultReferrerCandidate);
    setMachineReferrer(defaultReferrerCandidate);
    setReferrerSource("onchain");
    setStatus(t.bindReferrerSuccess);
  });

  const onBuyNode = async () => guardedAction(async () => {
    await ensureReferrerReady();
    if (!CORE_CONTRACT_ADDRESS) throw new Error(t.missingCoreConfig);
    if (usdtBalance < nodePrice) throw new Error(t.insufficientUsdtBalance);
    await ensureUsdtApproval(CORE_CONTRACT_ADDRESS, nodePrice, coreAllowance, "core");
    setStatus(t.buyingNode);
    await buyNode(provider!);
    setStatus(t.buyNodeSuccess);
  });

  const onBuySuperNode = async () => guardedAction(async () => {
    await ensureReferrerReady();
    if (!CORE_CONTRACT_ADDRESS) throw new Error(t.missingCoreConfig);
    if (usdtBalance < superPrice) throw new Error(t.insufficientUsdtBalance);
    await ensureUsdtApproval(CORE_CONTRACT_ADDRESS, superPrice, coreAllowance, "core");
    setStatus(t.buyingSuperNode);
    await buySuperNode(provider!);
    setStatus(t.buySuperNodeSuccess);
  });


  const onCreateOtcOrder = async () => guardedAction(async () => {
    if (!identityId) throw new Error(t.noIdentity);
    const price = parseUsdt(newOtcPrice || "0");
    if (price <= 0n) throw new Error(t.invalidListingPrice);
    if (!identityApproved) {
      if (!OTC_CONTRACT_ADDRESS) throw new Error(t.missingOtcConfig);
      setStatus(t.approvingIdentity);
      await approveIdentityForOtc(provider!, identityId, OTC_CONTRACT_ADDRESS);
      setStatus(t.approvedIdentitySuccess);
    }
    setStatus(t.creatingListing);
    await createOtcOrder(provider!, identityId, price);
    setStatus(t.createListingSuccess);
  });

  const onFillOrder = async (orderId: bigint) => guardedAction(async () => {
    const order = activeOrders.find((item) => item.id === orderId);
    if (!order) throw new Error(lang === "zh" ? "订单不存在，请刷新列表" : "Order not found — refresh the list");
    if (!order.active) throw new Error(lang === "zh" ? "该订单已失效，请刷新列表" : "Order is no longer active — refresh the list");
    if (order.seller.toLowerCase() === address.toLowerCase()) throw new Error(lang === "zh" ? "不能购买自己发布的挂单" : "You cannot fill your own listing");
    if (!OTC_CONTRACT_ADDRESS) throw new Error(t.missingOtcConfig);
    if (usdtBalance < order.priceUSDT) throw new Error(t.insufficientUsdtBalance);
    await ensureUsdtApproval(OTC_CONTRACT_ADDRESS, order.priceUSDT, otcAllowance, "otc");
    setStatus(`${t.fillingOrder} #${orderId}...`);
    await fillOtcOrder(provider!, orderId);
    setStatus(`${t.fillOrderSuccess} #${orderId}`);
  });

  const onCancelOrder = async (orderId: bigint) => guardedAction(async () => {
    setStatus(`${t.cancellingOrder} #${orderId}...`);
    await cancelOtcOrder(provider!, orderId);
    setStatus(`${t.cancelOrderSuccess} #${orderId}`);
  });

  const onRefreshSwapQuote = async () => {
    if (!provider || !address) {
      setStatus(t.connectFirst);
      return;
    }
    try {
      setLoading(true);
      await refreshSwapPanel(provider, address);
      setStatus(t.quoteRefreshed);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t.quoteRefreshFailed);
    } finally {
      setLoading(false);
    }
  };

  const onApproveSwapToken = async () => guardedAction(async () => {
    if (!swapTokenInAddress) throw new Error(t.refreshSwapFirst);
    const swapSpender = activePairId === LIGHT_ICO_PAIR_ID
      ? SWAP_POOL_ADDRESS
      : getPrimarySwapSpender();
    if (!swapSpender) throw new Error(t.missingSwapConfig);
    setStatus(`${t.approvingToken} ${swapTokenInSymbol}...`);
    await approveToken(provider!, swapTokenInAddress, swapSpender, parseTokenAmount("1000000000", swapTokenInDecimals));
    await refreshSwapPanel(provider!, address);
    setStatus(`${swapTokenInSymbol} ${t.approveTokenSuccess}`);
  });

  const onSwapExecute = async () => guardedAction(async () => {
    if (!swapTokenInAddress || !swapTokenOutAddress) throw new Error(t.refreshSwapFirst);
    if (swapQuoteOut <= 0n) throw new Error(t.getValidQuoteFirst);
    const amountInRaw = parseTokenAmount(swapAmountIn, swapTokenInDecimals);
    const swapSpender = activePairId === LIGHT_ICO_PAIR_ID
      ? SWAP_POOL_ADDRESS
      : getPrimarySwapSpender();
    if (!swapSpender) throw new Error(t.missingSwapConfig);
    // Pre-flight: balance check
    if (swapTokenInBalance < amountInRaw) throw new Error(t.insufficientTokenBalance);
    // Pre-flight: price impact guard
    if (swapPoolImpactLimitBps > 0 && swapQuoteImpactBps >= swapPoolImpactLimitBps) {
      throw new Error(t.priceImpactBlocked);
    }
    if (swapTokenInAllowance < amountInRaw) {
      setStatus(`${t.autoApproveThenPay} ${t.approvingToken} ${swapTokenInSymbol}...`);
      await approveToken(provider!, swapTokenInAddress, swapSpender, parseTokenAmount("1000000000", swapTokenInDecimals));
      setStatus(`${swapTokenInSymbol} ${t.approveTokenSuccess}`);
    }
    const minOut = (swapQuoteOut * BigInt(10_000 - swapSlippageBps)) / 10_000n;
    setStatus(`${t.swapping} ${swapTokenInSymbol} -> ${swapTokenOutSymbol}...`);
    if (activePairId === LIGHT_ICO_PAIR_ID) {
      await swapExactIn(provider!, activePairId, swapTokenInAddress, amountInRaw, minOut, address);
    } else {
      await swapPrimaryExactIn(provider!, activeSwapDirection, amountInRaw, minOut, address);
    }
    // Clear stale quote so user must refresh before swapping again
    setSwapQuoteOut(0n);
    setSwapQuoteFee(0n);
    setSwapQuoteImpactBps(0);
    await refreshSwapPanel(provider!, address);
    setStatus(`${t.swapSuccess} ${swapTokenInSymbol} -> ${swapTokenOutSymbol}`);
  });

  const activeTabLabel = t[("tab_" + activeTab) as keyof typeof t] || activeTab;

  return (
    <>
    {showFirstConnectGuide ? (
      <div className="guide-overlay" role="dialog" aria-modal="true" aria-label={t.firstGuideTitle}>
        <div className="guide-card">
          <h3>{t.firstGuideTitle}</h3>
          <p className="hint">{t.firstGuideHint}</p>
          <ol className="guide-steps">
            <li>{t.firstGuideStepNetwork}</li>
            <li>{t.firstGuideStepToken}</li>
            <li>{t.firstGuideStepReferrer}</li>
            <li>{t.firstGuideStepRefresh}</li>
          </ol>
          <div className="actions">
            <button
              className="primary-btn"
              type="button"
              onClick={onRunFirstConnectGuide}
              disabled={firstConnectGuideRunning || loading}
            >
              {firstConnectGuideRunning ? t.firstGuideRunning : t.firstGuideRun}
            </button>
            <button className="ghost-btn" type="button" onClick={markFirstConnectGuideDone} disabled={firstConnectGuideRunning}>
              {t.firstGuideLater}
            </button>
          </div>
        </div>
      </div>
    ) : null}

    <header className="header header-fixed">
      <div className="topbar-logo">
        <div className="brand-mark" aria-hidden="true">
          <img src="/logo.png" alt="Incubator" className="brand-mark__logo" />
        </div>
        <span className="brand-name">Incubator</span>
        {activeTabLabel && <span className="page-title-sep">·</span>}
        <h1 className="page-title">{activeTabLabel}</h1>
      </div>

      <div className="topbar-actions">
        {isOwner ? (
          <button className="ghost-btn" type="button" onClick={() => setActiveTab("admin")}>
            {t.tab_admin}
          </button>
        ) : null}
        <button className="icon-btn" onClick={toggleTheme} title="Toggle Theme" type="button">
          {theme === "dark" ? "🌙" : "☀️"}
        </button>
        <button className="icon-btn" onClick={toggleLang} title="Toggle Language" type="button">
          {lang === "zh" ? "中" : "EN"}
        </button>
        <ConnectButton
          label={t.connect}
          showBalance={false}
          chainStatus="icon"
          accountStatus={{ smallScreen: "avatar", largeScreen: "full" }}
        />
      </div>
    </header>

    <main className="container">
      <section className="tabs desktop-tabs">
        {visibleDesktopTabs.map((tab) => <button key={tab.key} className={tab.key === activeTab ? "tab-btn tab-active" : "tab-btn"} onClick={() => setActiveTab(tab.key)}>{t[("tab_" + tab.key) as keyof typeof t] || tab.label}</button>)}
      </section>

      {activeTab === "overview" ? (
        <section className="grid">
          <Card title={t.accountSnapshot} hint={t.accountHint}>
            <KVRow label={t.walletStatus} value={isConnected ? t.connected : t.notConnected} />
            <KVRow label={t.network} value={networkLabel} />
            <KVRow label={t.role} value={roleLabel} />
            <KVRow label={t.balance} value={formatUsdt(usdtBalance) + " USDT"} />
            <KVRow label={t.coreApproval} value={formatUsdt(coreAllowance) + " USDT"} />
            {isOwner ? (
              <KVRow
                label={t.ownerPanel}
                value={(
                  <button type="button" className="link-btn" onClick={() => setActiveTab("admin")}>
                    {t.openAdminPanel}
                  </button>
                )}
              />
            ) : null}
          </Card>

          {/* 奖金榜单卡片 */}
          <Card
            className="lb-card-prominent"
            title={lang === "zh" ? "🏆 奖金排名" : "🏆 Bonus Rankings"}
            onClick={() => setShowLeaderboard(true)}
            style={{ cursor: "pointer" }}
          >
            <div className="ranking-card">
              {top3Leaderboard.length === 0 ? (
                <p className="ranking-empty">{lang === "zh" ? "暂无排名数据" : "No ranking data yet"}</p>
              ) : (
                <div className="ranking-list">
                  {top3Leaderboard.map((entry) => (
                    <div key={entry.rank} className={`ranking-row rank-${entry.rank}`}>
                      <span className="ranking-medal">
                        {entry.rank === 1 ? "🥇" : entry.rank === 2 ? "🥈" : "🥉"}
                      </span>
                      <span className="ranking-addr">{entry.address.slice(0, 10)}…</span>
                      <span className="ranking-vol">{formatUsdt(entry.volume)} USDT</span>
                    </div>
                  ))}
                </div>
              )}
              <p className="ranking-hint">
                {lang === "zh" ? "点击查看完整榜单" : "Click to view full rankings"}
              </p>
              <p className="ranking-note">
                {lang === "zh" ? "今日为实时排名，奖励以昨日结算页为准" : "Today is real-time; rewards are finalized on yesterday settlement."}
              </p>
            </div>
          </Card>

          {/* 平台资金池面板 */}
          <Card title={t.poolPanelTitle} hint={t.poolPanelHint}>
            <div className="pool-panel-grid">
              <div className="pool-panel-cell">
                <p className="pool-panel-label">{t.poolPrimary}</p>
                <p className="pool-panel-value">{formatTokenAmount(primaryPoolReserve.ico, 18)} ICO</p>
                <p className="pool-panel-value">{formatUsdt(primaryPoolReserve.usdt)} USDT</p>
              </div>
              <div className="pool-panel-cell">
                <p className="pool-panel-label">{t.poolLight}</p>
                <p className="pool-panel-value">{formatTokenAmount(lightPoolReserve.light, 18)} LIGHT</p>
                <p className="pool-panel-value">{formatTokenAmount(lightPoolReserve.ico, 18)} ICO</p>
              </div>
              <div className="pool-panel-cell">
                <p className="pool-panel-label">{t.poolSuperNode}</p>
                <p className="pool-panel-value">{formatUsdt(superNodePoolBalance)} USDT</p>
              </div>
              <div className="pool-panel-cell">
                <p className="pool-panel-label">{t.poolNode}</p>
                <p className="pool-panel-value">{formatUsdt(nodePoolBalance)} USDT</p>
              </div>
              <div className="pool-panel-cell">
                <p className="pool-panel-label">{t.poolPlatform}</p>
                <p className="pool-panel-value">{formatUsdt(platformPoolBalance)} USDT</p>
              </div>
              <div className="pool-panel-cell">
                <p className="pool-panel-label">{t.poolLeaderboard}</p>
                <p className="pool-panel-value">{formatUsdt(leaderboardPoolBalance)} USDT</p>
              </div>
            </div>
            <div className="actions" style={{ marginTop: "1rem" }}>
              <button
                className="primary-btn"
                type="button"
                onClick={() => setActiveTab("mine")}
              >
                {t.myWallet}
              </button>
              <button
                className="primary-btn primary-btn--ghost"
                type="button"
                onClick={() => setActiveTab("otc")}
              >
                {t.buyNodeNow}
              </button>
            </div>
          </Card>

          {/* 绑定推荐人（非 Owner 且未绑定且非默认 Owner 来源时显示） */}
          {!isOwner && !hasBoundReferrer && referrerSource !== "owner" ? (
            <Card title={t.referrerCardTitle} hint={t.referrerCardHint}>
              <label className="field">
                {t.referrerInputLabel}
                <input
                  type="text"
                  placeholder="0x..."
                  value={machineReferrer}
                  onChange={(e) => {
                    setMachineReferrer(e.target.value);
                    setReferrerSource("manual");
                  }}
                />
              </label>
              {referrerSourceLabel ? <p className="chip-label">{referrerSourceLabel}</p> : null}
              <p className="hint">{t.referrerInputTip}</p>
              <div className="actions">
                <button
                  className="primary-btn"
                  onClick={onBindReferrer}
                  disabled={loading || !referrerCandidate || hasInvalidManualReferrer || Boolean(bindReferrerDisabledReason)}
                >
                  {loading ? t.loading : t.bindReferrer}
                </button>
                <button
                  className="primary-btn primary-btn--ghost"
                  onClick={onBindDefaultReferrer}
                  disabled={loading || !defaultReferrerCandidate || Boolean(bindReferrerDisabledReason)}
                >
                  {loading ? t.loading : t.bindDefaultReferrer}
                </button>
              </div>
              {bindReferrerHint ? <p className="action-hint">{bindReferrerHint}</p> : null}
            </Card>
          ) : null}

          <Card title={t.flowTitle} hint={t.flowHint}>
            <div className="flow-grid">
              {purchaseFlow.map((step) => (
                <div key={step.label} className={step.done ? "flow-step flow-step-done" : "flow-step"}>
                  <span>{step.label}</span>
                  <strong>{step.done ? "✓" : "..."}</strong>
                </div>
              ))}
            </div>
          </Card>

          <Card title={t.addTokenTitle} hint={t.addTokenHint}>
            <div className="actions">
              <button
                className="primary-btn primary-btn--ghost"
                type="button"
                onClick={() => onAddProjectToken("ICO")}
                disabled={addingTokenSymbol !== null || !ICO_TOKEN_ADDRESS}
              >
                {addingTokenSymbol === "ICO" ? t.loading : t.addIcoToken}
              </button>
              <button
                className="primary-btn primary-btn--ghost"
                type="button"
                onClick={() => onAddProjectToken("LIGHT")}
                disabled={addingTokenSymbol !== null || !LIGHT_TOKEN_ADDRESS}
              >
                {addingTokenSymbol === "LIGHT" ? t.loading : t.addLightToken}
              </button>
            </div>
          </Card>

          {/* 算力购买卡 */}
          <Card title={t.machineTitle} className="machine-card">
            <div className="machine-orb machine-orb--one"></div>
            <div className="machine-orb machine-orb--two"></div>
            <KVRow label={t.machineUnitPrice} value={formatUsdt(machinePrice) + " USDT"} />
            <p className="hint">{t.machineHint}</p>
            <label className="field">
              {t.quantity}
              <input
                type="number"
                min={1}
                max={10}
                value={machineQty}
                onChange={(e) => setMachineQty(Number(e.target.value || 1))}
              />
            </label>
            <div className="machine-cta-sticky">
              <div className="machine-total-row">
                <span>{t.orderTotal}</span>
                <strong>{formatUsdt(machineTotal)} USDT</strong>
              </div>

              {/* Step 1: USDT Approval */}
              {needsUsdtApproval ? (
                <div className="actions">
                  <button
                    className="primary-btn"
                    onClick={onApproveUsdt}
                    disabled={loading || usdtApprovalInProgress}
                  >
                    {usdtApprovalInProgress ? t.loading : "授权 USDT"}
                  </button>
                </div>
              ) : (
                <div className="chip-label">✓ 已授权</div>
              )}

              {/* Step 2&3: Purchase (only show if approved) */}
              {machineApprovalConfirmed && (
                <div className="actions">
                  <button
                    className="primary-btn"
                    onClick={() => setShowMachineRiskModal(true)}
                    disabled={loading || usdtApprovalInProgress}
                  >
                    {loading ? t.loading : "确认并购买"}
                  </button>
                </div>
              )}

              {/* Risk Confirmation Modal */}
              <RiskConfirmationModal
                isOpen={showMachineRiskModal}
                details={{
                  quantity: machineQty,
                  unitPrice: machinePrice,
                  totalAmount: machineTotal,
                  feePreview: getMachineAllocationPreview(),
                  network: CNC_MAINNET_CHAIN_NAME,
                  address: address || "",
                }}
                onConfirm={onConfirmMachineRisk}
                onCancel={() => setShowMachineRiskModal(false)}
              />
            </div>
            <p className="hint">{t.machineAutoApproveHint}</p>
            <p className="hint">{t.machineBusinessHint}</p>
          </Card>

          {/* 节点购买卡 */}
          <Card title={t.nodeTitle}>
            <KVRow label={t.nodePrice} value={formatUsdt(nodePrice) + " USDT"} />
            <p className="hint">{t.nodeDesc}</p>
            
            {/* 状态展示 */}
            <div className="stats-grid">
              <div className="stat-pill">
                <span>我的状态</span>
                <strong>{role === 0 ? "未购买" : role === 1 ? "✓ 已购买" : "超级节点"}</strong>
              </div>
              <div className="stat-pill">
                <span>购买限制</span>
                <strong>最多 1 个</strong>
              </div>
            </div>

            <div className="actions">
              <button 
                className="primary-btn" 
                onClick={onBuyNode} 
                disabled={loading || Boolean(nodeDisabledReason) || role !== 0}
              >
                {loading ? t.loading : role === 0 ? t.buyNode : role === 1 ? "升级为超级节点" : "已拥有"}
              </button>
            </div>
            {nodeDisabledReason && role === 0 ? <p className="action-hint">{nodeDisabledReason}</p> : null}
          </Card>

          {/* 超级节点购买卡 */}
          <Card title={t.superNodeTitle}>
            <KVRow label={t.superNodePrice} value={formatUsdt(superPrice) + " USDT"} />
            <p className="hint">{t.superNodeDesc}</p>

            {/* 身份信息展示 */}
            <div className="stats-grid">
              <div className="stat-pill">
                <span>当前身份</span>
                <strong>
                  {role === 0 ? "普通用户" : role === 1 ? "节点用户" : "超级节点用户"}
                </strong>
              </div>
              <div className="stat-pill">
                <span>购买限制</span>
                <strong>最多 1 个</strong>
              </div>
            </div>

            {role === 1 && (
              <p className="hint">💡 作为节点持有者，您可以升级到超级节点获得更多权益</p>
            )}

            <div className="actions">
              <button 
                className="primary-btn" 
                onClick={onBuySuperNode} 
                disabled={loading || Boolean(superDisabledReason) || role === 2}
              >
                {loading ? t.loading : role === 2 ? "已拥有" : role === 1 ? "升级为超级节点" : t.buySuperNode}
              </button>
            </div>
            {superDisabledReason && role !== 2 ? <p className="action-hint">{superDisabledReason}</p> : null}
          </Card>

          {/* 公告卡 */}
          <Card title={t.homeAnnouncementsTitle} hint={t.homeAnnouncementsHint}>
            {announcements.length === 0 ? (
              <p className="hint">{t.homeNoAnnouncements}</p>
            ) : (
              <ul className="list">
                {announcements.slice(0, 5).map((item) => (
                  <li key={item.$id} className="list-item">
                    <div className="list-head">
                      <strong>{item.title}</strong>
                      <span>{item.category}</span>
                    </div>
                    <p>{item.summary}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </section>
      ) : null}

      {activeTab === "team" ? (
        <section className="grid-full">
          <Card title={t.teamTitle} hint={t.teamHint}>
            <div className="stats-grid">
              <div className="stat-pill">
                <span>{t.teamDirects}</span>
                <strong>{teamStats.directCount.toString()}</strong>
              </div>
              <div className="stat-pill">
                <span>{t.teamTotal}</span>
                <strong>{teamStats.teamCount.toString()}</strong>
              </div>
              <div className="stat-pill">
                <span>{t.teamDirectVolume}</span>
                <strong>{formatUsdt(teamStats.directVolume)} USDT</strong>
              </div>
              <div className="stat-pill">
                <span>{t.teamTotalVolume}</span>
                <strong>{formatUsdt(teamStats.teamVolume)} USDT</strong>
              </div>
            </div>

            <div className="referral-lists-container">
              <div className="referral-section">
                <h4 className="section-title">{t.myReferrerTab}</h4>
                {myReferrer ? (
                  <ul className="list">
                    <li className="list-item">
                      <div className="list-head">
                        <strong>{t.myReferrerTitle}</strong>
                        <span>{`${myReferrer.slice(0, 6)}...${myReferrer.slice(-4)}`}</span>
                      </div>
                      <p>{myReferrer}</p>
                    </li>
                  </ul>
                ) : (
                  <p className="hint">{t.noReferrerBound}</p>
                )}
              </div>

              <div className="referral-section">
                <h4 className="section-title">{t.myDirectsTab}</h4>
                {directReferrals.length === 0 ? (
                  <p className="hint">{t.noDirectReferrals}</p>
                ) : (
                  <>
                    <KVRow label={t.directReferralCountLabel} value={directReferrals.length} />
                    <ul className="list">
                      {directReferrals.map((ref, index) => (
                        <li className="list-item" key={ref}>
                          <div className="list-head">
                            <strong>{`#${index + 1}`}</strong>
                            <span>{`${ref.slice(0, 6)}...${ref.slice(-4)}`}</span>
                          </div>
                          <p>{ref}</p>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            </div>
          </Card>

          <Card title={t.inviteTitle} hint={t.inviteHint}>
            <div className="field">
              <label>{t.inviteLink}</label>
              <div className="invite-link-box">
                <input 
                  type="text" 
                  readOnly 
                  value={`${window.location.origin}${window.location.pathname}?ref=${address}`} 
                />
                <button className="primary-btn" onClick={onCopyInviteLink} disabled={!address}>
                  {t.copyLink}
                </button>
              </div>
            </div>
          </Card>
        </section>
      ) : null}

      {activeTab === "otc" ? (
        <section className="grid-full">
          <Card title={t.otcTitle} hint={t.otcHint}>
            <div className="kv-row">
              <span>{t.myIdentity}</span>
              <strong>{identityId ? String(identityId) : t.none}</strong>
            </div>
            <div className="kv-row">
              <span>{t.myIdentityRole}</span>
              <strong>{identityId ? getRoleLabelByValue(role) : t.none}</strong>
            </div>
            <div className="kv-row">
              <span>{t.identityApproval}</span>
              <strong>{identityApproved ? t.approved : t.notApproved}</strong>
            </div>
            <label className="field">
              {t.otcPrice}
              <input type="number" min={1} value={newOtcPrice} onChange={(event) => setNewOtcPrice(event.target.value)} />
            </label>
            <div className="actions">
              <button className="primary-btn" onClick={onCreateOtcOrder} disabled={loading || !identityId}>
                {loading ? t.loading : t.createListing}
              </button>
            </div>
            <p className="hint">{t.otcAutoApproveHint}</p>
          </Card>

          <Card title={t.otcRuleTitle} hint={t.otcRuleHint}>
            <KVRow label={t.otcFeeRate} value={`${(otcFeeBps / 100).toFixed(2)}%`} />
            <KVRow label={t.otcNodeLastPrice} value={`${formatUsdt(lastNodeTradePrice)} USDT`} />
            <KVRow label={t.otcSuperLastPrice} value={`${formatUsdt(lastSuperTradePrice)} USDT`} />
            <p className="hint">{t.otcRuleSingleListing}</p>
            <p className="hint">{t.otcRuleFloorPrice}</p>
          </Card>

          <Card title={t.activeListings}>
            {activeOrders.length === 0 ? (
              <p className="hint">{t.noListings}</p>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>{t.orderId}</th>
                      <th>{t.identityId}</th>
                      <th>{t.otcRole}</th>
                      <th>{t.seller}</th>
                      <th>{t.priceUsdt}</th>
                      <th>{t.action}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeOrders.map((order) => (
                      <tr key={String(order.id)}>
                        <td>{String(order.id)}</td>
                        <td>{String(order.identityId)}</td>
                        <td>{getRoleLabelByValue(order.role)}</td>
                        <td>{`${order.seller.slice(0, 6)}...${order.seller.slice(-4)}`}</td>
                        <td>{formatUsdt(order.priceUSDT)}</td>
                        <td>
                          {address && order.seller.toLowerCase() === address.toLowerCase() ? (
                            <button className="link-btn" onClick={() => onCancelOrder(order.id)} disabled={loading}>
                              {t.cancel}
                            </button>
                          ) : (
                            <button className="link-btn" onClick={() => onFillOrder(order.id)} disabled={loading}>
                              {t.fill}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </section>
      ) : null}

      {activeTab === "swap" ? (
        <section className="grid-full">
          <Card title={t.swapTitle} className="swap-card">
            <div className="swap-sub-tabs">
              <button 
                className={swapSubTab === "primary" ? "tab-btn tab-active" : "tab-btn"} 
                onClick={() => setSwapSubTab("primary")}
              >
                {t.swapSubPrimary}
              </button>
              <button 
                className={swapSubTab === "light" ? "tab-btn tab-active" : "tab-btn"} 
                onClick={() => setSwapSubTab("light")}
              >
                {t.swapSubLight}
              </button>
            </div>

            {swapSubTab === "primary" ? (
              <>
                <div className="swap-hero">
                  <div>
                    <h2>{t.swapTitle} — USDT / ICO</h2>
                    <p className="hint">{t.swapPoolPrimaryDesc}</p>
                    <p className="hint">{t.swapAutoHint}</p>
                  </div>
                  <div className="swap-hero-badge-wrap">
                    <span className="swap-mode-badge">{t.swapPrimaryMode}</span>
                  </div>
                </div>

                <div className="swap-shell">
                  <div className="swap-panel">
                    <div className="swap-flow-card">
                      <div className="swap-flow-head">
                        <strong>{t.swapFlowTitle}</strong>
                        <span>{swapRouteLabel}</span>
                      </div>
                      <div className="flow-grid swap-flow-grid">
                        {swapFlow.map((step) => (
                          <div key={step.label} className={`flow-step ${step.done ? "flow-step-done" : ""}`}>
                            <span>{step.label}</span>
                            <strong>{step.done ? "✓" : "..."}</strong>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="swap-direction-row">
                      <label className="field swap-field-grow">
                        {t.swapDirection}
                        <select
                          value={swapDirection}
                          onChange={(event) => setSwapDirection(event.target.value as SwapDirection)}
                        >
                          <option value="forward">{swapTokenInSymbol === "-" ? poolToken0Name : swapTokenInSymbol} -&gt; {swapTokenOutSymbol === "-" ? poolToken1Name : swapTokenOutSymbol}</option>
                          <option value="reverse">{swapTokenOutSymbol === "-" ? poolToken1Name : swapTokenOutSymbol} -&gt; {swapTokenInSymbol === "-" ? poolToken0Name : swapTokenInSymbol}</option>
                        </select>
                      </label>
                      <button className="ghost-btn" onClick={onReverseSwapDirection} type="button">
                        {t.reverseDirection}
                      </button>
                    </div>

                    <div className="swap-input-card">
                      <div className="swap-input-top">
                        <span>{t.inputAmount}</span>
                        <button className="chip-btn" onClick={onSetSwapMax} type="button">{t.max}</button>
                      </div>
                      <input type="number" min={0} value={swapAmountIn} onChange={(event) => setSwapAmountIn(event.target.value)} />
                      <p className="hint">{t.tokenBalance}（{swapTokenInSymbol}）：{formatTokenAmount(swapTokenInBalance, swapTokenInDecimals)}</p>
                    </div>
                  </div>

                  <div className="swap-summary">
                    <div className="swap-cta-card">
                      <div className="swap-cta-copy">
                        <span>{t.swapNextAction}</span>
                        <strong>{swapPrimaryActionLabel}</strong>
                        <p>{swapPrimaryActionHint}</p>
                      </div>
                      <div className="swap-cta-actions">
                        <button className="primary-btn swap-primary-btn" onClick={onSwapPrimaryAction} disabled={!(swapCanApprove || swapCanExecute)}>
                          {swapPrimaryActionLabel}
                        </button>
                        <button className="ghost-btn swap-secondary-btn" onClick={onRefreshSwapQuote} disabled={loading || !provider || !address} type="button">
                          {t.refreshQuote}
                        </button>
                      </div>
                    </div>
                    <div className="swap-stat">
                      <span>{t.estimatedOutput}</span>
                      <strong>{formatTokenAmount(swapQuoteOut, swapTokenOutDecimals)} {swapTokenOutSymbol}</strong>
                    </div>
                    <div className="swap-stat">
                      <span>{t.estimatedFee}</span>
                      <strong>{formatTokenAmount(swapQuoteFee, swapTokenInDecimals)} {swapTokenInSymbol}</strong>
                    </div>
                    <div className="swap-stat">
                      <span>{t.fee}</span>
                      <strong>{(swapPoolFeeBps / 100).toFixed(2)}%</strong>
                    </div>
                    <div className="swap-stat">
                      <span>{t.impactLimit}</span>
                      <strong>{(swapPoolImpactLimitBps / 100).toFixed(2)}%</strong>
                    </div>
                    <div className="swap-stat">
                      <span>{t.swapApprovalReady}</span>
                      <strong>{swapApprovalStatus}</strong>
                    </div>
                    <div className="swap-stat">
                      <span>{t.tokenAllowance}（{swapTokenInSymbol}）</span>
                      <strong>{formatTokenAmount(swapTokenInAllowance, swapTokenInDecimals)}</strong>
                    </div>
                    <div className="swap-stat">
                      <span>{t.estimatedImpact}</span>
                      <strong>{(swapQuoteImpactBps / 100).toFixed(2)}%</strong>
                    </div>
                    <div className={`swap-status swap-status-${swapImpactTone}`}>
                      <strong>{t.quoteStatus}</strong>
                      <span>{swapStatusText}</span>
                      <small>{swapImpactLabel}</small>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="swap-hero">
                  <div>
                    <h2>{t.swapTitle} — LIGHT / ICO</h2>
                    <p className="hint">{t.swapPoolLightDesc}</p>
                    <p className="hint">{t.swapAutoHint}</p>
                  </div>
                  <div className="swap-hero-badge-wrap">
                    <span className="swap-mode-badge swap-mode-badge-warn">{t.swapLightMode}</span>
                  </div>
                </div>

                <div className="swap-shell">
                  <div className="swap-panel">
                    <div className="swap-flow-card swap-flow-card-warn">
                      <div className="swap-flow-head">
                        <strong>{t.swapFlowTitle}</strong>
                        <span>{t.swapRouteLockedBadge}</span>
                      </div>
                      <div className="flow-grid swap-flow-grid">
                        {swapFlow.map((step) => (
                          <div key={step.label} className={`flow-step ${step.done ? "flow-step-done" : ""}`}>
                            <span>{step.label}</span>
                            <strong>{step.done ? "✓" : "..."}</strong>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="swap-note swap-note-warn">{t.swapDirectionLocked}</div>

                    <div className="swap-input-card">
                      <div className="swap-input-top">
                        <span>{t.inputAmount}</span>
                        <button className="chip-btn" onClick={onSetSwapMax} type="button">{t.max}</button>
                      </div>
                      <input type="number" min={0} value={swapAmountIn} onChange={(event) => setSwapAmountIn(event.target.value)} />
                      <p className="hint">{t.tokenBalance}（{swapTokenInSymbol}）：{formatTokenAmount(swapTokenInBalance, swapTokenInDecimals)}</p>
                    </div>
                  </div>

                  <div className="swap-summary">
                    <div className="swap-cta-card swap-cta-card-warn">
                      <div className="swap-cta-copy">
                        <span>{t.swapNextAction}</span>
                        <strong>{swapPrimaryActionLabel}</strong>
                        <p>{swapPrimaryActionHint}</p>
                      </div>
                      <div className="swap-cta-actions">
                        <button className="primary-btn swap-primary-btn" onClick={onSwapPrimaryAction} disabled={!(swapCanApprove || swapCanExecute)}>
                          {swapPrimaryActionLabel}
                        </button>
                        <button className="ghost-btn swap-secondary-btn" onClick={onRefreshSwapQuote} disabled={loading || !provider || !address} type="button">
                          {t.refreshQuote}
                        </button>
                      </div>
                    </div>
                    <div className="swap-stat">
                      <span>{t.estimatedOutput}</span>
                      <strong>{formatTokenAmount(swapQuoteOut, swapTokenOutDecimals)} {swapTokenOutSymbol}</strong>
                    </div>
                    <div className="swap-stat">
                      <span>{t.estimatedFee}</span>
                      <strong>{formatTokenAmount(swapQuoteFee, swapTokenInDecimals)} {swapTokenInSymbol}</strong>
                    </div>
                    <div className="swap-stat">
                      <span>{t.fee}</span>
                      <strong>{(swapPoolFeeBps / 100).toFixed(2)}%</strong>
                    </div>
                    <div className="swap-stat">
                      <span>{t.impactLimit}</span>
                      <strong>{(swapPoolImpactLimitBps / 100).toFixed(2)}%</strong>
                    </div>
                    <div className="swap-stat">
                      <span>{t.swapApprovalReady}</span>
                      <strong>{swapApprovalStatus}</strong>
                    </div>
                    <div className="swap-stat">
                      <span>{t.tokenAllowance}（{swapTokenInSymbol}）</span>
                      <strong>{formatTokenAmount(swapTokenInAllowance, swapTokenInDecimals)}</strong>
                    </div>
                    <div className="swap-stat">
                      <span>{t.estimatedImpact}</span>
                      <strong>{(swapQuoteImpactBps / 100).toFixed(2)}%</strong>
                    </div>
                    <div className={`swap-status swap-status-${swapImpactTone}`}>
                      <strong>{t.quoteStatus}</strong>
                      <span>{swapStatusText}</span>
                      <small>{swapImpactLabel}</small>
                    </div>
                  </div>
                </div>
              </>
            )}
          </Card>
        </section>
      ) : null}

      {activeTab === "mine" ? (
        historyToken && provider && address ? (
          <TokenHistory
            tokenType={historyToken}
            userAddress={address}
            provider={provider}
            onBack={() => setHistoryToken(null)}
            lang={lang}
          />
        ) : (
        <section className="grid-full">
          <Card title={t.assetsTitle} hint={t.assetsHint}>
            <div className="stats-grid">
              <div className="stat-pill">
                <span>{t.role}</span>
                <strong>{roleLabel}</strong>
              </div>
              <div className="stat-pill">
                <span>{t.myIdentity}</span>
                <strong>{identityId ? String(identityId) : t.none}</strong>
              </div>
              <div className="stat-pill">
                <span>{t.totalMachineOrders}</span>
                <strong>{machineOrderCount}</strong>
              </div>
              <div className="stat-pill">
                <span>{t.recentRewardCount}</span>
                <strong>{rewardRecords.length}</strong>
              </div>
            </div>

            <div className="kv-list">
              <KVRow label={t.balance} value={`${formatUsdt(usdtBalance)} USDT`} />
              <KVRow label={t.coreApproval} value={`${formatUsdt(coreAllowance)} USDT`} />
              <KVRow label={t.otcApproval} value={`${formatUsdt(otcAllowance)} USDT`} />
              <KVRow label={t.recentMachineUnits} value={`${String(recentMachineUnits)} ${t.quantityUnit}`} />
              <KVRow label={t.recentMachineAmount} value={`${formatUsdt(recentMachineAmount)} USDT`} />
              <KVRow label={t.recentRewardAmount} value={`${formatUsdt(recentRewardAmount)} USDT`} />
              <KVRow label={t.loadedRecentOrders} value={orders.length} />
              <KVRow label={t.loadedRecentRewards} value={rewardRecords.length} />
            </div>
          </Card>

          {/* 钱包流水入口 */}
          {isConnected && address && provider && (
            <Card title={lang === "zh" ? "钱包流水" : "Wallet History"}>
              <div className="history-entry-btns">
                <button
                  className="history-entry-btn"
                  type="button"
                  onClick={() => setHistoryToken("ICO")}
                >
                  ICO{lang === "zh" ? "流水" : " History"}
                </button>
                <button
                  className="history-entry-btn"
                  type="button"
                  onClick={() => setHistoryToken("LIGHT")}
                >
                  Light{lang === "zh" ? "流水" : " History"}
                </button>
                <button
                  className="history-entry-btn"
                  type="button"
                  onClick={() => setHistoryToken("USDT")}
                >
                  USDT{lang === "zh" ? "流水" : " History"}
                </button>
              </div>
            </Card>
          )}

          <Card title={t.ordersTitle} hint={t.ordersHint}>
            <div className="history-entry-btns">
              <button
                className={`history-entry-btn ${ordersTokenTab === "ICO" ? "active" : ""}`}
                type="button"
                onClick={() => setOrdersTokenTab("ICO")}
              >
                ICO
              </button>
              <button
                className={`history-entry-btn ${ordersTokenTab === "LIGHT" ? "active" : ""}`}
                type="button"
                onClick={() => setOrdersTokenTab("LIGHT")}
              >
                LIGHT
              </button>
              <button
                className={`history-entry-btn ${ordersTokenTab === "USDT" ? "active" : ""}`}
                type="button"
                onClick={() => setOrdersTokenTab("USDT")}
              >
                USDT
              </button>
            </div>
            <p className="hint">{t.tokenOrdersWindow}</p>
            {loadingTokenInOutRecords ? (
              <p className="hint">{t.loadingTokenOrders}</p>
            ) : selectedTokenOrders.length === 0 ? (
              <p className="hint">{t.noTokenOrders}</p>
            ) : (
              <ul className="list">
                {selectedTokenOrders.map((record) => (
                  <li key={`${record.txHash}-${record.token}-${record.direction}-${record.blockNumber}`} className="list-item">
                    <div className="list-head">
                      <strong>{`${record.token} ${record.direction === "in" ? "+" : "-"}${formatTokenInOutAmount(record)}`}</strong>
                      <span>{record.orderType}</span>
                    </div>
                    <p>{t.tokenOrderType}：{record.direction === "in" ? "IN" : "OUT"}</p>
                    <p>{t.tokenOrderCounterparty}：{`${record.counterparty.slice(0, 8)}...${record.counterparty.slice(-6)}`}</p>
                    <p>{t.tokenOrderTime}：{formatTokenInOutTime(record.timestamp)}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title={t.machineOrdersTitle} hint={t.machineOrdersHint}>
            {orders.length === 0 ? (
              <p className="hint">{t.noOrders}</p>
            ) : (
              <ul className="list">
                {orders.map((order) => (
                  <li key={String(order.id)} className="list-item">
                    <div className="list-head">
                      <strong>{`${t.orderId} #${String(order.id)}`}</strong>
                      <span>{`${String(order.quantity)} ${t.quantityUnit}`}</span>
                    </div>
                    <p>{t.amount}：{formatUsdt(order.amountUSDT)} USDT</p>
                    <p>{t.timestamp}：{new Date(Number(order.createdAt)).toLocaleString(lang === "zh" ? 'zh-CN' : 'en-US')}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title={t.rewardsTitle} hint={t.rewardsHint}>
            {rewardRecords.length === 0 ? (
              <p className="hint">{t.noRewards}</p>
            ) : (
              <ul className="list">
                {rewardRecords.map((reward) => (
                  <li key={`${reward.txHash}-${String(reward.orderId)}-${reward.poolType}`} className="list-item">
                    <div className="list-head">
                      <strong>{`${t.rewardOrder} #${String(reward.orderId)}`}</strong>
                      <span>{`${t.rewardPool} #${reward.poolType}`}</span>
                    </div>
                    <p>{t.rewardAmount}：{formatUsdt(reward.amountUSDT)} USDT</p>
                    <p>{t.blockNumber}：{reward.blockNumber}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </section>
        )
      ) : null}

      {activeTab === "admin" && isOwner ? (
        <Admin lang={lang} address={address} contractOwner={contractOwner} provider={provider} onRefresh={onRefreshWallet} onStatusChange={setStatus} />
      ) : null}

      {/* 奖金分配榜单 (全屏覆盖) */}
      {showLeaderboard ? (
        <div className="fullscreen-overlay">
          <Leaderboard
            provider={provider ?? readonlyProvider as unknown as BrowserProvider}
            onBack={() => setShowLeaderboard(false)}
            lang={lang}
          />
        </div>
      ) : null}

      {/* 底部导航栏 */}
      <nav className="bottom-nav">
        {visibleMobileTabs.map((tab) => (
          <button key={"bot-" + tab.key} className={`nav-item ${tab.key === activeTab ? "active" : ""}`} onClick={() => setActiveTab(tab.key)}>
            <div className="nav-icon">
              {tab.key === "overview" && "🏠"}
              {tab.key === "team" && "👥"}
              {tab.key === "otc" && "🤝"}
              {tab.key === "swap" && "🔄"}
              {tab.key === "mine" && "🧑"}
              {tab.key === "admin" && "⚙️"}
            </div>
            <span>{t[("tab_" + tab.key) as keyof typeof t] || tab.label}</span>
          </button>
        ))}
      </nav>
    </main>
    </>
  );
}

export default App;
