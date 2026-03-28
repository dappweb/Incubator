import React, { useEffect, useMemo, useState } from "react";
import { BrowserProvider, isAddress } from "ethers";

import "./App.css";
import "./types/ethereum";
import { fetchPublishedAnnouncements, type Announcement } from "./lib/announcements";
import {
  buyNode,
  bindReferrer,
  buySuperNode,
  getMachineOrder,
  getMachineUnitPrice,
  getNodePrice,
  getSuperNodePrice,
  getUserMachineOrderIds,
  getUserRole,
  getReferrer,
  getContractOwner,
  getTeamStats,
  purchaseMachine,
  type MachineOrder,
  type RewardRecord,
  type TeamStats,
  getRewardRecordsByBeneficiary,
} from "./lib/coreContract";
import { getActiveOrderIds, getOrder, fillOtcOrder, cancelOtcOrder, createOtcOrder, type OtcOrder } from "./lib/otcContract";
import { checkConnection, connectWallet, ensureSepoliaNetwork, isOnSepolia, listenToWalletEvents } from "./lib/wallet";
import { approveUsdt, formatUsdt, getUsdtAllowance, getUsdtBalance, parseUsdt } from "./lib/usdtContract";
import { approveIdentityForOtc, getTokenOfOwner, isIdentityApproved } from "./lib/identityContract";
import { CORE_CONTRACT_ADDRESS, OTC_CONTRACT_ADDRESS, SWAP_POOL_ADDRESS } from "./config";
import { approveToken, formatTokenAmount, getTokenAllowance, getTokenBalance, getTokenMeta, parseTokenAmount } from "./lib/tokenContract";
import { getSwapPool, quoteSwapExactIn, swapExactIn } from "./lib/swapContract";
import { Card, KVRow } from "./components/Common";
import Admin from "./components/Admin";

type TabKey = "overview" | "team" | "otc" | "swap" | "mine" | "admin";
type SwapSubTab = "primary" | "light";
type SwapDirection = "forward" | "reverse";

const LIGHT_ICO_PAIR_ID = 1;

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
  const [isRefreshing, setIsRefreshing] = useState(false);
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
    tab_machine: lang === "zh" ? "矿机" : "Machines",
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
    balance: lang === "zh" ? "USDT 余额" : "USDT Balance",
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
    pricesGuideHint: lang === "zh" ? "想快速成交，可从这里直接进入购买矿机、购买节点或购买超级节点流程。" : "Use these shortcuts to jump straight into buying a miner, node, or super node.",
    payMachineNow: lang === "zh" ? "立即购买矿机" : "Buy Miner Now",
    payNodeNow: lang === "zh" ? "立即购买节点" : "Buy Node Now",
    paySuperNow: lang === "zh" ? "立即购买超级节点" : "Buy Super Node Now",
    machineUnitPrice: lang === "zh" ? "矿机单价" : "Machine Price",
    nodePrice: lang === "zh" ? "节点价格" : "Node Price",
    superNodePrice: lang === "zh" ? "超级节点价格" : "Super Node Price",
    approvalsTitle: lang === "zh" ? "授权状态" : "Approvals",
    approvalsHint: lang === "zh" ? "授权决定你当前可直接执行的链上操作额度。" : "Allowances determine how much you can execute on-chain without re-approving.",
    coreApproval: lang === "zh" ? "Core 授权额度" : "Core Allowance",
    otcApproval: lang === "zh" ? "市场授权额度" : "Market Allowance",
    quickActionsTitle: lang === "zh" ? "快捷入口" : "Quick Actions",
    quickActionsHint: lang === "zh" ? "移动端底部菜单已精简，兑换入口可从这里快速进入。" : "The mobile menu is simplified. You can jump to Swap from here anytime.",
    goSwap: lang === "zh" ? "前往兑换" : "Go to Swap",
    machineTitle: lang === "zh" ? "购买矿机" : "Buy Mining Machines",
    machineBadge: lang === "zh" ? "MINER ENTRY" : "MINER ENTRY",
    machineHint: lang === "zh" ? "适合希望快速参与生态的用户，可按需灵活购买数量。" : "Designed for users who want fast access to the ecosystem with flexible quantity selection.",
    machineHeroTitle: lang === "zh" ? "轻量入场，快速建立矿机仓位" : "Start light, build your miner position fast",
    machineHeroDesc: lang === "zh" ? "矿机购买已整合到首页，适合新用户直接完成授权、下单与首笔生态配置。" : "Machine purchase now lives on the home page so new users can approve, place orders and complete their first allocation in one flow.",
    machineFeatureA: lang === "zh" ? "支持 1-10 台灵活购买" : "Flexible orders from 1 to 10 units",
    machineFeatureB: lang === "zh" ? "授权完成后可连续下单" : "Repeat orders once allowance is ready",
    machineFeatureC: lang === "zh" ? "适合作为节点升级前置仓位" : "Useful as a pre-node accumulation position",
    machineQtyLabel: lang === "zh" ? "本次购买" : "This order",
    machineAllowanceLabel: lang === "zh" ? "可用授权" : "Allowance ready",
    machineGapLabel: lang === "zh" ? "仍需授权" : "Allowance gap",
    machineAllowanceReady: lang === "zh" ? "授权已满足当前下单" : "Allowance already covers this order",
    referrerCardTitle: lang === "zh" ? "绑定推荐人" : "Bind Referrer",
    referrerCardHint: lang === "zh" ? "购买矿机 / 节点 / 超级节点前，必须先绑定推荐人。默认推荐人为合约 Owner，绑定后不可更改。" : "You must bind a referrer before purchasing. Default referrer is the contract owner. Cannot be changed once bound.",
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
    nodeDesc: lang === "zh" ? "无需门槛，可直接购买节点资格，成功后立即生效。" : "No entry requirement. Buy node access directly and it becomes effective once confirmed on-chain.",
    buyNode: lang === "zh" ? "立即购买节点" : "Buy Node",
    buyNodeLocked: lang === "zh" ? "已拥有节点身份" : "Node Already Owned",
    superNodeTitle: lang === "zh" ? "购买超级节点" : "Buy Super Node",
    superNodeDesc: lang === "zh" ? "需先拥有节点身份，再升级为超级节点。" : "You must own a node first before upgrading to a super node.",
    buySuperNode: lang === "zh" ? "立即购买超级节点" : "Buy Super Node",
    buySuperNodeLocked: lang === "zh" ? "需先购买节点" : "Buy Node First",
    flowTitle: lang === "zh" ? "购买流程" : "Purchase Flow",
    flowHint: lang === "zh" ? "按步骤完成后可减少失败率与重复操作。" : "Follow these steps to reduce failures and repeat actions.",
    stepConnect: lang === "zh" ? "连接钱包" : "Connect Wallet",
    stepReferrer: lang === "zh" ? "确认推荐人" : "Confirm Referrer",
    bindReferrer: lang === "zh" ? "绑定推荐人" : "Bind Referrer",
    bindReferrerDone: lang === "zh" ? "已绑定推荐人" : "Referrer Bound",
    stepApprove: lang === "zh" ? "USDT 授权就绪" : "USDT Allowance Ready",
    stepPurchase: lang === "zh" ? "提交购买" : "Submit Purchase",
    accountSnapshot: lang === "zh" ? "账户快照" : "Account Snapshot",
    accountHint: lang === "zh" ? "关键状态一屏可见，减少来回切换。" : "Keep key states visible to reduce context switching.",
    needConnectToBuy: lang === "zh" ? "请先连接钱包" : "Connect wallet first",
    needSepoliaToBuy: lang === "zh" ? "请先切换到 Sepolia" : "Switch to Sepolia first",
    needReferrerToBuy: lang === "zh" ? "请先绑定推荐人" : "Bind a referrer first",
    roleMismatchForNode: lang === "zh" ? "当前身份不可重复购买节点" : "Current role cannot buy node again",
    roleMismatchForSuper: lang === "zh" ? "需先购买节点后再升级" : "Buy node first, then upgrade",
    otcTitle: lang === "zh" ? "节点市场" : "Node Market",
    otcHint: lang === "zh" ? "在这里可以挂卖或购买节点身份，所有成交结果以链上状态为准。" : "List or buy node identities here. Final settlement always follows on-chain state.",
    myIdentity: lang === "zh" ? "我的身份 ID" : "My Identity ID",
    none: lang === "zh" ? "暂无" : "None",
    identityApproval: lang === "zh" ? "身份授权状态" : "Identity Approval",
    approved: lang === "zh" ? "已授权" : "Approved",
    notApproved: lang === "zh" ? "未授权" : "Not Approved",
    otcPrice: lang === "zh" ? "挂单价格（USDT）" : "Listing Price (USDT)",
    approveIdentity: lang === "zh" ? "授权身份 ID" : "Approve Identity",
    approveOtc: lang === "zh" ? "授权市场 USDT" : "Approve Market USDT",
    createListing: lang === "zh" ? "创建挂单" : "Create Listing",
    otcAutoApproveHint: lang === "zh" ? "首次挂单或购买时，将自动完成所需身份 / USDT 授权。" : "Required identity or USDT approvals are completed automatically on first list or buy.",
    activeListings: lang === "zh" ? "节点挂单" : "Node Listings",
    noListings: lang === "zh" ? "当前暂无可交易挂单。" : "No active listings right now.",
    orderId: lang === "zh" ? "订单ID" : "Order ID",
    identityId: lang === "zh" ? "身份ID" : "Identity ID",
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
    ordersHint: lang === "zh" ? "这里汇总你的链上出入金相关记录（当前优先展示矿机订单流水）。" : "This section summarizes your on-chain in/out records (currently focused on machine order flows).",
    noOrders: lang === "zh" ? "暂无出入金记录。" : "No in/out records yet.",
    rewardsTitle: lang === "zh" ? "奖励记录" : "Reward Records",
    rewardsHint: lang === "zh" ? "展示当前钱包链上已结算奖励（RewardSettled 事件）。" : "Shows on-chain settled rewards for this wallet (RewardSettled events).",
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
    switchSepolia: lang === "zh" ? "请先切换到 Sepolia 网络。" : "Please switch to Sepolia first.",
    txFailed: lang === "zh" ? "交易执行失败" : "Transaction failed",
    missingCoreConfig: lang === "zh" ? "缺少 VITE_CORE_CONTRACT_ADDRESS 配置" : "Missing VITE_CORE_CONTRACT_ADDRESS",
    approvingUsdtCore: lang === "zh" ? "正在提交 Core 的 USDT 授权..." : "Submitting Core USDT approval...",
    approvedCoreSuccess: lang === "zh" ? "Core 授权已完成。" : "Core approval confirmed.",
    autoApproveThenPay: lang === "zh" ? "检测到授权不足，正在自动补齐授权..." : "Allowance is insufficient. Completing approval automatically...",
    missingOtcConfig: lang === "zh" ? "缺少 VITE_OTC_CONTRACT_ADDRESS 配置" : "Missing VITE_OTC_CONTRACT_ADDRESS",
    approvingUsdtOtc: lang === "zh" ? "正在提交 OTC 的 USDT 授权..." : "Submitting OTC USDT approval...",
    approvedOtcSuccess: lang === "zh" ? "市场 USDT 授权已完成。" : "Market USDT approval confirmed.",
    invalidMachineQty: lang === "zh" ? "矿机购买数量需在 1 到 10 之间。" : "Machine quantity must be between 1 and 10.",
    invalidReferrer: lang === "zh" ? "推荐人地址格式不正确。" : "Invalid referrer address.",
    referrerAlreadyBound: lang === "zh" ? "推荐人已绑定，无需重复操作。" : "Referrer already bound.",
    bindingReferrer: lang === "zh" ? "正在绑定推荐人..." : "Binding referrer...",
    bindReferrerSuccess: lang === "zh" ? "推荐人绑定成功。" : "Referrer bound successfully.",
    buyingMachine: lang === "zh" ? "正在提交矿机购买交易..." : "Submitting machine purchase...",
    buyMachineSuccess: lang === "zh" ? "矿机购买成功。" : "Machine purchase completed.",
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
    nav: lang === "zh" ? "导航" : "Navigation",
    statusReady: lang === "zh" ? "系统就绪" : "System Ready",
    loading: lang === "zh" ? "加载中..." : "Loading...",
  };

  const [address, setAddress] = useState("");
  const [chainId, setChainId] = useState(0);
  const [provider, setProvider] = useState<BrowserProvider | null>(null);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [status, setStatus] = useState("");
  const [contractOwner, setContractOwner] = useState("");

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
  const [orders, setOrders] = useState<MachineOrder[]>([]);
  const [rewardRecords, setRewardRecords] = useState<RewardRecord[]>([]);
  const [teamStats, setTeamStats] = useState<TeamStats>({
    directCount: 0n,
    teamCount: 0n,
    directVolume: 0n,
    teamVolume: 0n,
  });

  const [identityId, setIdentityId] = useState<bigint | null>(null);
  const [identityApproved, setIdentityApproved] = useState(false);
  const [newOtcPrice, setNewOtcPrice] = useState("100");
  const [activeOrders, setActiveOrders] = useState<OtcOrder[]>([]);

  const [swapPairId, setSwapPairId] = useState(0);
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

  const resetWalletState = () => {
    setAddress("");
    setChainId(0);
    setProvider(null);
    setRole(0);
    setUsdtBalance(0n);
    setCoreAllowance(0n);
    setOtcAllowance(0n);
    setOrders([]);
    setRewardRecords([]);
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
    setReferrerSource("none");
    setContractOwner("");
  };

  const networkLabel = useMemo(() => {
    if (!chainId) return t.notConnected;
    return isOnSepolia(chainId) ? "Sepolia" : `${t.wrongNetwork} (chainId=${chainId})`;
  }, [chainId, t.notConnected, t.wrongNetwork]);

  const maskedAddress = useMemo(() => {
    if (!address) return "-";
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  }, [address]);
  const isWrongNetwork = useMemo(() => Boolean(chainId) && !isOnSepolia(chainId), [chainId]);
  const headerNetworkBadgeLabel = useMemo(() => {
    if (!chainId) return t.notConnected;
    return isWrongNetwork ? t.wrongNetwork : t.networkReady;
  }, [chainId, isWrongNetwork, t.networkReady, t.notConnected, t.wrongNetwork]);

  const isConnected = Boolean(address && provider);

  const machineTotal = useMemo(() => machinePrice * BigInt(machineQty || 0), [machinePrice, machineQty]);
  const machineApprovalGap = useMemo(() => (machineTotal > coreAllowance ? machineTotal - coreAllowance : 0n), [coreAllowance, machineTotal]);
  const roleLabel = useMemo(() => (role === 2 ? t.roleSuperNode : role === 1 ? t.roleNode : t.roleUser), [role, t.roleNode, t.roleSuperNode, t.roleUser]);
  const hasValidReferrer = useMemo(() => Boolean(machineReferrer && isAddress(machineReferrer)), [machineReferrer]);
  const hasBoundReferrer = useMemo(
    () => referrerSource === "onchain" && Boolean(machineReferrer && isAddress(machineReferrer)),
    [machineReferrer, referrerSource],
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
    if (isWrongNetwork) return t.needSepoliaToBuy;
    if (!hasBoundReferrer) return t.needReferrerToBuy;
    return "";
  }, [hasBoundReferrer, isConnected, isWrongNetwork, t.needConnectToBuy, t.needReferrerToBuy, t.needSepoliaToBuy]);
  const nodeDisabledReason = useMemo(() => {
    if (!isConnected) return t.needConnectToBuy;
    if (isWrongNetwork) return t.needSepoliaToBuy;
    if (!hasBoundReferrer) return t.needReferrerToBuy;
    if (role !== 0) return t.roleMismatchForNode;
    return "";
  }, [hasBoundReferrer, isConnected, isWrongNetwork, role, t.needConnectToBuy, t.needReferrerToBuy, t.needSepoliaToBuy, t.roleMismatchForNode]);
  const superDisabledReason = useMemo(() => {
    if (!isConnected) return t.needConnectToBuy;
    if (isWrongNetwork) return t.needSepoliaToBuy;
    if (!hasBoundReferrer) return t.needReferrerToBuy;
    if (role !== 1) return t.roleMismatchForSuper;
    return "";
  }, [hasBoundReferrer, isConnected, isWrongNetwork, role, t.needConnectToBuy, t.needReferrerToBuy, t.needSepoliaToBuy, t.roleMismatchForSuper]);
  const purchaseFlow = useMemo(
    () => [
      { label: t.stepConnect, done: isConnected },
      { label: t.stepReferrer, done: hasBoundReferrer },
      { label: t.stepApprove, done: coreAllowance >= machineTotal && machineTotal > 0n },
      { label: t.stepPurchase, done: false },
    ],
    [coreAllowance, hasBoundReferrer, isConnected, machineTotal, t.stepApprove, t.stepConnect, t.stepPurchase, t.stepReferrer],
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
    () => address && contractOwner && address.toLowerCase() === contractOwner.toLowerCase(),
    [address, contractOwner],
  );
  const visibleDesktopTabs = useMemo(() => {
    const tabs = [...DESKTOP_TABS];
    if (isOwner) {
      tabs.push({ key: "admin" as TabKey, label: "管理" });
    }
    return tabs;
  }, [isOwner]);
  const visibleMobileTabs = useMemo(() => {
    const tabs = [...MOBILE_TABS];
    if (isOwner) {
      tabs.push({ key: "admin" as TabKey, label: "管理" });
    }
    return tabs;
  }, [isOwner]);
  const isLightRecoveryPool = useMemo(() => activePairId === LIGHT_ICO_PAIR_ID, [activePairId]);
  const effectiveSwapDirection = useMemo<SwapDirection>(
    () => activeSwapDirection,
    [activeSwapDirection],
  );
  const swapPoolModeLabel = useMemo(
    () => (isLightRecoveryPool ? t.swapLightMode : t.swapPrimaryMode),
    [isLightRecoveryPool, t.swapLightMode, t.swapPrimaryMode],
  );
  const swapPoolDescription = useMemo(
    () => (isLightRecoveryPool ? t.swapPoolLightDesc : t.swapPoolPrimaryDesc),
    [isLightRecoveryPool, t.swapPoolLightDesc, t.swapPoolPrimaryDesc],
  );
  const swapDistributionText = useMemo(
    () => (isLightRecoveryPool ? t.swapLightDistribution : "-"),
    [isLightRecoveryPool, t.swapLightDistribution],
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
    return swapHasEnoughBalance;
  }, [loading, swapAmountRaw, swapHasEnoughBalance, swapQuoteOut]);

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
    if (!SWAP_POOL_ADDRESS) return;

    const activeDirection = pairId === LIGHT_ICO_PAIR_ID ? "forward" : direction;

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
    const [nextMachinePrice, nextNodePrice, nextSuperPrice, nextRole, balance, allowanceCore, allowanceOtc] = await Promise.all([
      getMachineUnitPrice(connectedProvider),
      getNodePrice(connectedProvider),
      getSuperNodePrice(connectedProvider),
      getUserRole(connectedProvider, wallet),
      getUsdtBalance(connectedProvider, wallet),
      CORE_CONTRACT_ADDRESS ? getUsdtAllowance(connectedProvider, wallet, CORE_CONTRACT_ADDRESS) : Promise.resolve(0n),
      OTC_CONTRACT_ADDRESS ? getUsdtAllowance(connectedProvider, wallet, OTC_CONTRACT_ADDRESS) : Promise.resolve(0n),
    ]);

    setMachinePrice(nextMachinePrice);
    setNodePrice(nextNodePrice);
    setSuperPrice(nextSuperPrice);
    setRole(nextRole);
    setUsdtBalance(balance);
    setCoreAllowance(allowanceCore);
    setOtcAllowance(allowanceOtc);

    // 团队统计
    try {
      const stats = await getTeamStats(connectedProvider, wallet);
      setTeamStats(stats);
    } catch (e) {
      console.error("Failed to fetch user stats", e);
    }

    // 检查并绑定推荐人
    const currentReferrer = await getReferrer(connectedProvider, wallet);
    if (currentReferrer === "0x0000000000000000000000000000000000000000") {
      // 检查 URL 中是否有推荐人
      const params = new URLSearchParams(window.location.search);
      const urlRef = params.get("ref");
      
      if (urlRef && isAddress(urlRef)) {
        setMachineReferrer(urlRef);
        setReferrerSource("link");
      } else {
        const owner = await getContractOwner(connectedProvider);
        setContractOwner(owner);
        setMachineReferrer(owner);
        setReferrerSource("owner");
      }
    } else {
      setMachineReferrer(currentReferrer);
      setReferrerSource("onchain");
    }

    const orderIds = await getUserMachineOrderIds(connectedProvider, wallet);
    const nextOrders = await Promise.all(orderIds.slice(Math.max(0, orderIds.length - 8)).map((id) => getMachineOrder(connectedProvider, id)));
    setOrders(nextOrders.reverse().map(order => ({
      ...order,
      createdAt: order.createdAt * 1000n // Convert seconds to milliseconds
    })));

    try {
      const nextRewardRecords = await getRewardRecordsByBeneficiary(connectedProvider, wallet, 12);
      setRewardRecords(nextRewardRecords);
    } catch (error) {
      console.error("Failed to fetch reward records", error);
      setRewardRecords([]);
    }

    const nextIdentityId = await getTokenOfOwner(connectedProvider, wallet);
    setIdentityId(nextIdentityId);
    setIdentityApproved(nextIdentityId && OTC_CONTRACT_ADDRESS ? await isIdentityApproved(connectedProvider, nextIdentityId, OTC_CONTRACT_ADDRESS) : false);

    if (OTC_CONTRACT_ADDRESS) {
      const ids = await getActiveOrderIds(connectedProvider);
      const nextActiveOrders = await Promise.all(ids.slice(0, 20).map((id) => getOrder(connectedProvider, id)));
      setActiveOrders(nextActiveOrders.filter((row) => row.active));
    } else {
      setActiveOrders([]);
    }

    await refreshSwapPanel(connectedProvider, wallet);
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

  const onConnect = async () => {
    try {
      await ensureSepoliaNetwork();
      const connection = await connectWallet();
      await syncWalletState(connection.provider, connection.address, connection.chainId);
      setStatus(t.walletConnected);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t.walletConnectFailed);
    }
  };

  const onDisconnect = () => {
    resetWalletState();
    setStatus(t.walletDisconnected);
  };

  const onCopyAddress = async () => {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setStatus(t.copied);
    } catch {
      setStatus(address);
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

  const onSwitchNetwork = async () => {
    try {
      await ensureSepoliaNetwork();
      await onRefreshWallet();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t.switchSepolia);
    }
  };

  const onSetSwapMax = () => {
    setSwapAmountIn(formatTokenAmount(swapTokenInBalance, swapTokenInDecimals));
  };

  const onReverseSwapDirection = () => {
    if (swapPairId === LIGHT_ICO_PAIR_ID || swapSubTab === "light") {
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
      await ensureSepoliaNetwork();
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
    if (!isOnSepolia(chainId)) {
      setStatus(t.switchSepolia);
      return;
    }
    try {
      setLoading(true);
      await action();
      await refreshAll(provider, address);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t.txFailed);
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

  const onApproveCore = async () => guardedAction(async () => {
    if (!CORE_CONTRACT_ADDRESS) throw new Error(t.missingCoreConfig);
    setStatus(t.approvingUsdtCore);
    await approveUsdt(provider!, CORE_CONTRACT_ADDRESS, parseUsdt("1000000000"));
    setStatus(t.approvedCoreSuccess);
  });

  const onApproveOtc = async () => guardedAction(async () => {
    if (!OTC_CONTRACT_ADDRESS) throw new Error(t.missingOtcConfig);
    setStatus(t.approvingUsdtOtc);
    await approveUsdt(provider!, OTC_CONTRACT_ADDRESS, parseUsdt("1000000000"));
    setStatus(t.approvedOtcSuccess);
  });

  const onBuyMachine = async () => guardedAction(async () => {
    if (machineQty < 1 || machineQty > 10) throw new Error(t.invalidMachineQty);
    if (!hasBoundReferrer) throw new Error(t.needReferrerToBuy);
    if (!CORE_CONTRACT_ADDRESS) throw new Error(t.missingCoreConfig);
    await ensureUsdtApproval(CORE_CONTRACT_ADDRESS, machineTotal, coreAllowance, "core");
    setStatus(t.buyingMachine);
    await purchaseMachine(provider!, machineQty);
    setStatus(t.buyMachineSuccess);
  });

  const onBindReferrer = async () => guardedAction(async () => {
    const referrer = machineReferrer.trim();
    if (!isAddress(referrer)) throw new Error(t.invalidReferrer);
    if (hasBoundReferrer) {
      setStatus(t.referrerAlreadyBound);
      return;
    }
    setStatus(t.bindingReferrer);
    await bindReferrer(provider!, referrer);
    setReferrerSource("onchain");
    setStatus(t.bindReferrerSuccess);
  });

  const onBuyNode = async () => guardedAction(async () => {
    if (!hasBoundReferrer) throw new Error(t.needReferrerToBuy);
    if (!CORE_CONTRACT_ADDRESS) throw new Error(t.missingCoreConfig);
    await ensureUsdtApproval(CORE_CONTRACT_ADDRESS, nodePrice, coreAllowance, "core");
    setStatus(t.buyingNode);
    await buyNode(provider!);
    setStatus(t.buyNodeSuccess);
  });

  const onBuySuperNode = async () => guardedAction(async () => {
    if (!hasBoundReferrer) throw new Error(t.needReferrerToBuy);
    if (!CORE_CONTRACT_ADDRESS) throw new Error(t.missingCoreConfig);
    await ensureUsdtApproval(CORE_CONTRACT_ADDRESS, superPrice, coreAllowance, "core");
    setStatus(t.buyingSuperNode);
    await buySuperNode(provider!);
    setStatus(t.buySuperNodeSuccess);
  });

  const onApproveIdentity = async () => guardedAction(async () => {
    if (!identityId) throw new Error(t.noIdentity);
    if (!OTC_CONTRACT_ADDRESS) throw new Error(t.missingOtcConfig);
    setStatus(t.approvingIdentity);
    await approveIdentityForOtc(provider!, identityId, OTC_CONTRACT_ADDRESS);
    setStatus(t.approvedIdentitySuccess);
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
    if (!order) throw new Error("订单不存在");
    if (!OTC_CONTRACT_ADDRESS) throw new Error(t.missingOtcConfig);
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
    if (!SWAP_POOL_ADDRESS) throw new Error(t.missingSwapConfig);
    if (!swapTokenInAddress) throw new Error(t.refreshSwapFirst);
    setStatus(`${t.approvingToken} ${swapTokenInSymbol}...`);
    await approveToken(provider!, swapTokenInAddress, SWAP_POOL_ADDRESS, parseTokenAmount("1000000000", swapTokenInDecimals));
    await refreshSwapPanel(provider!, address);
    setStatus(`${swapTokenInSymbol} ${t.approveTokenSuccess}`);
  });

  const onSwapExecute = async () => guardedAction(async () => {
    if (!swapTokenInAddress || !swapTokenOutAddress) throw new Error(t.refreshSwapFirst);
    if (swapQuoteOut <= 0n) throw new Error(t.getValidQuoteFirst);
    if (!SWAP_POOL_ADDRESS) throw new Error(t.missingSwapConfig);
    const amountInRaw = parseTokenAmount(swapAmountIn, swapTokenInDecimals);
    if (swapTokenInAllowance < amountInRaw) {
      setStatus(`${t.autoApproveThenPay} ${t.approvingToken} ${swapTokenInSymbol}...`);
      await approveToken(provider!, swapTokenInAddress, SWAP_POOL_ADDRESS, parseTokenAmount("1000000000", swapTokenInDecimals));
      setStatus(`${swapTokenInSymbol} ${t.approveTokenSuccess}`);
    }
    const minOut = (swapQuoteOut * BigInt(10_000 - swapSlippageBps)) / 10_000n;
    setStatus(`${t.swapping} ${swapTokenInSymbol} -> ${swapTokenOutSymbol}...`);
    await swapExactIn(provider!, activePairId, swapTokenInAddress, amountInRaw, minOut, address);
    await refreshSwapPanel(provider!, address);
    setStatus(`${t.swapSuccess} ${swapTokenInSymbol} -> ${swapTokenOutSymbol}`);
  });

  const activeTabLabel = t[("tab_" + activeTab) as keyof typeof t] || activeTab;

  return (
    <>
    <header className="header header-fixed">
      <div className="topbar-logo">
        <div className="brand-mark" aria-hidden="true">
          <span className="brand-mark__core"></span>
        </div>
        <h1 className="page-title">{activeTabLabel}</h1>
      </div>

      <div className="topbar-actions">
        <button className="icon-btn" onClick={toggleTheme} title="Toggle Theme" type="button">
          {theme === "dark" ? "🌙" : "☀️"}
        </button>
        <button className="icon-btn" onClick={toggleLang} title="Toggle Language" type="button">
          {lang === "zh" ? "中" : "EN"}
        </button>
        <button onClick={isConnected ? onDisconnect : onConnect} className="primary-btn" disabled={loading} type="button">
          {loading ? t.loading : (isConnected ? t.disconnect : t.connect)}
        </button>
      </div>
    </header>

    <main className="container">
      <section className="tabs desktop-tabs">
        {visibleDesktopTabs.map((tab) => <button key={tab.key} className={tab.key === activeTab ? "tab-btn tab-active" : "tab-btn"} onClick={() => setActiveTab(tab.key)}>{t[("tab_" + tab.key) as keyof typeof t] || tab.label}</button>)}
      </section>

      {activeTab === "overview" ? (
        <section className="grid">
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

          <Card title={t.accountSnapshot} hint={t.accountHint}>
            <KVRow label={t.walletStatus} value={isConnected ? t.connected : t.notConnected} />
            <KVRow label={t.network} value={networkLabel} />
            <KVRow label={t.role} value={roleLabel} />
            <KVRow label={t.balance} value={formatUsdt(usdtBalance) + " USDT"} />
            <KVRow label={t.coreApproval} value={formatUsdt(coreAllowance) + " USDT"} />
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

          {/* 绑定推荐人（独立卡片） */}
          <Card title={t.referrerCardTitle} hint={t.referrerCardHint}>
            {hasBoundReferrer ? (
              <>
                <KVRow label={t.referrerInputLabel} value={machineReferrer} />
                <p className="chip-label">{t.referrerFromChain}</p>
              </>
            ) : (
              <>
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
                  <button className="primary-btn" onClick={onBindReferrer} disabled={loading || !hasValidReferrer}>
                    {loading ? t.loading : t.bindReferrer}
                  </button>
                </div>
              </>
            )}
          </Card>

          {/* 矿机购买卡 */}
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
              <div className="actions">
                <button className="primary-btn" onClick={onBuyMachine} disabled={loading || Boolean(machineDisabledReason)}>
                  {loading ? t.loading : t.submitMachine}
                </button>
              </div>
              {machineDisabledReason ? <p className="action-hint">{machineDisabledReason}</p> : null}
            </div>
            <p className="hint">{t.machineAutoApproveHint}</p>
          </Card>

          {/* 节点购买卡 */}
          <Card title={t.nodeTitle}>
            <KVRow label={t.nodePrice} value={formatUsdt(nodePrice) + " USDT"} />
            <p className="hint">{t.nodeDesc}</p>
            <div className="actions">
              <button className="primary-btn" onClick={onBuyNode} disabled={loading || Boolean(nodeDisabledReason)}>
                {loading ? t.loading : role === 0 ? t.buyNode : t.buyNodeLocked}
              </button>
            </div>
            {nodeDisabledReason ? <p className="action-hint">{nodeDisabledReason}</p> : null}
          </Card>

          {/* 超级节点购买卡 */}
          <Card title={t.superNodeTitle}>
            <KVRow label={t.superNodePrice} value={formatUsdt(superPrice) + " USDT"} />
            <p className="hint">{t.superNodeDesc}</p>
            <div className="actions">
              <button className="primary-btn" onClick={onBuySuperNode} disabled={loading || Boolean(superDisabledReason)}>
                {loading ? t.loading : role === 1 ? t.buySuperNode : t.buySuperNodeLocked}
              </button>
            </div>
            {superDisabledReason ? <p className="action-hint">{superDisabledReason}</p> : null}
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
          <Card className="swap-card">
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

                <div className="actions">
                  <button className="primary-btn" onClick={onSwapExecute} disabled={!swapCanExecute}>{t.executeSwap}</button>
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

                <div className="actions">
                  <button className="primary-btn" onClick={onSwapExecute} disabled={!swapCanExecute}>{t.executeSwap}</button>
                </div>
              </>
            )}
          </Card>
        </section>
      ) : null}

      {activeTab === "mine" ? (
        <section className="grid-full">
          <Card title={t.ordersTitle} hint={t.ordersHint}>
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
      ) : null}

      {activeTab === "admin" && isOwner ? (
        <Admin lang={lang} address={address} contractOwner={contractOwner} />
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
