/**
 * Parses raw ethers / MetaMask errors into user-readable messages.
 *
 * Priority order:
 *  1. User rejection (4001 / ACTION_REJECTED) → "您已取消交易"
 *  2. Solidity revert reason extracted from error → look up in known-reason map
 *  3. Known provider-level conditions (gas, network, timeout)
 *  4. Fallback to truncated raw message
 */

type Lang = "zh" | "en";

// Internal type for casting unknown errors
interface RawError {
  code?: number | string;
  message?: string;
  shortMessage?: string;
  reason?: string;
  data?: { message?: string };
  info?: { error?: { code?: number; message?: string; data?: { message?: string } } };
  revert?: { args?: unknown[] };
}

// ---------------------------------------------------------------------------
// Known contract revert reasons → friendly messages
// ---------------------------------------------------------------------------

const REVERT_REASON_MAP: Array<{ key: string; zh: string; en: string }> = [
  // Referrer
  { key: "bind referrer first",       zh: "请先绑定推荐人",               en: "Please bind a referrer first" },
  { key: "already bound",             zh: "推荐人已绑定，无法再次修改",   en: "Referrer already bound and cannot be changed" },
  { key: "invalid referrer",          zh: "推荐人地址无效",               en: "Invalid referrer address" },
  // Roles / identity
  { key: "already has role",          zh: "您已拥有该身份，无需重复购买", en: "You already have this role" },
  { key: "already a super node",      zh: "您已是超级节点，无需重复购买", en: "You are already a super node" },
  { key: "node required",             zh: "需要先拥有节点身份",           en: "Node role is required" },
  { key: "not owner",                 zh: "仅合约管理员可执行此操作",     en: "Only the contract owner can do this" },
  // ERC20 / USDT
  { key: "ERC20InsufficientAllowance", zh: "USDT 授权额度不足，请先授权", en: "Insufficient USDT allowance — please approve first" },
  { key: "ERC20InsufficientBalance",  zh: "USDT 余额不足",               en: "Insufficient USDT balance" },
  { key: "insufficient allowance",    zh: "USDT 授权额度不足，请先授权", en: "Insufficient USDT allowance — please approve first" },
  { key: "transfer amount exceeds balance", zh: "USDT 余额不足",         en: "Insufficient USDT balance" },
  // Swap pool
  { key: "price impact too high",     zh: "价格影响过高，流动性不足，请减少兑换数量", en: "Price impact too high — reduce swap amount" },
  { key: "slippage exceeded",         zh: "价格滑点超出设置范围，请刷新报价后重试",   en: "Slippage exceeded — refresh quote and retry" },
  { key: "insufficient output",       zh: "输出数量低于最低限额，请刷新报价",         en: "Output below minimum — refresh quote" },
  { key: "pool not exist",            zh: "交易对不存在",                 en: "Swap pool not found" },
  { key: "invalid pair",              zh: "交易对参数无效",               en: "Invalid swap pair" },
  // OTC market
  { key: "order not active",          zh: "该订单已失效，请刷新列表",     en: "Order is no longer active — refresh the list" },
  { key: "not seller",                zh: "只有卖家才能撤销该挂单",       en: "Only the seller can cancel this order" },
  { key: "self trade",                zh: "不能购买自己发布的挂单",       en: "You cannot fill your own listing" },
  { key: "seller cannot fill",        zh: "不能购买自己发布的挂单",       en: "You cannot fill your own listing" },
  { key: "invalid price",             zh: "挂单价格无效",                 en: "Invalid listing price" },
  { key: "market not set",            zh: "市场合约地址未配置",           en: "Market contract not configured" },
  { key: "identity not approved",     zh: "身份 NFT 未授权给市场合约，请先授权", en: "Identity NFT not approved for the market — approve first" },
  // Quantity
  { key: "invalid quantity",          zh: "购买数量无效（范围 1–10）",    en: "Invalid quantity (must be 1–10)" },
  // Paused
  { key: "EnforcedPause",             zh: "合约已暂停维护，请稍后再试",   en: "Contract is paused — try again later" },
  { key: "Pausable: paused",          zh: "合约已暂停维护，请稍后再试",   en: "Contract is paused — try again later" },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isUserRejection(error: unknown): boolean {
  const e = error as RawError;
  // EIP-1193 code 4001
  if (e?.code === 4001) return true;
  // ethers v6 ACTION_REJECTED
  if (e?.code === "ACTION_REJECTED") return true;
  // nested provider error
  if (e?.info?.error?.code === 4001) return true;
  const msg: string = (e?.message ?? e?.shortMessage ?? "").toLowerCase();
  return msg.includes("user rejected") || msg.includes("user denied") || msg.includes("rejected the request");
}

function extractRevertReason(error: unknown): string | null {
  const e = error as RawError;

  // ethers v6: revert args
  const viaArgs = e?.revert?.args?.[0];
  if (typeof viaArgs === "string" && viaArgs.length > 0) return viaArgs;

  // ethers reason field
  if (typeof e?.reason === "string" && e.reason.length > 0) return e.reason;

  // nested message from provider
  const nested: string | undefined = e?.data?.message ?? e?.info?.error?.data?.message ?? e?.info?.error?.message;
  if (typeof nested === "string" && nested.length > 0 && !nested.startsWith("0x")) return nested;

  // Parse from human-readable error string
  const raw: string = e?.message ?? e?.shortMessage ?? "";
  const patterns = [
    /reverted with reason string ['"](.*?)['"]/i,
    /execution reverted: ['"](.*?)['"]/i,
    /execution reverted: (.*?)(?:\s*\(|$)/i,
    /reverted: (.*?)(?:\s*\(|$)/i,
    /Error: (.*?)(?:\s*\(|$)/i,
  ];
  for (const re of patterns) {
    const m = raw.match(re);
    if (m?.[1]?.trim()) return m[1].trim();
  }

  return null;
}

function matchRevertReason(reason: string, lang: Lang): string {
  const lower = reason.toLowerCase();
  for (const entry of REVERT_REASON_MAP) {
    if (lower.includes(entry.key.toLowerCase())) {
      return entry[lang];
    }
  }
  // Return the raw reason but capped
  const clean = reason.length > 100 ? reason.slice(0, 100) + "…" : reason;
  return lang === "zh" ? `合约拒绝：${clean}` : `Contract rejected: ${clean}`;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function parseContractError(error: unknown, lang: Lang = "zh"): string {
  // 1. User rejected in wallet
  if (isUserRejection(error)) {
    return lang === "zh" ? "您已取消该操作" : "Transaction cancelled by user";
  }

  // 2. Known revert reason
  const reason = extractRevertReason(error);
  if (reason) {
    return matchRevertReason(reason, lang);
  }

  // 3. Provider-level / network conditions
  const raw = error as RawError;
  const msg: string = (raw?.message ?? raw?.shortMessage ?? "").toLowerCase();

  if (msg.includes("insufficient funds") || msg.includes("INSUFFICIENT_FUNDS")) {
    return lang === "zh"
      ? "ETH 余额不足，请确保钱包有足够 Gas 费"
      : "Insufficient ETH — make sure you have enough for gas fees";
  }
  if (msg.includes("nonce too low") || msg.includes("nonce has already been used")) {
    return lang === "zh"
      ? "交易 Nonce 冲突，请在 MetaMask 设置中重置账户后重试"
      : "Nonce conflict — reset your account in MetaMask settings and retry";
  }
  if (msg.includes("timeout") || msg.includes("TIMEOUT")) {
    return lang === "zh"
      ? "网络请求超时，请稍后重试"
      : "Request timed out — please retry";
  }
  if (msg.includes("network") || msg.includes("NETWORK_ERROR") || msg.includes("could not detect network")) {
    return lang === "zh"
      ? "网络连接异常，请检查 RPC 后重试"
      : "Network error — check your RPC connection and retry";
  }
  if (msg.includes("transaction underpriced")) {
    return lang === "zh"
      ? "Gas 价格过低，请提高 Gas 后重试"
      : "Gas price too low — increase gas and retry";
  }
  if (msg.includes("replacement fee too low")) {
    return lang === "zh"
      ? "替换交易的 Gas 价格不足，请提高后重试"
      : "Replacement transaction gas price too low";
  }
  if (msg.includes("already known") || msg.includes("already pending")) {
    return lang === "zh"
      ? "该交易已在等待队列中，请等待确认"
      : "Transaction already pending — wait for confirmation";
  }

  // 4. Fallback
  if (error instanceof Error) {
    const clean = error.message.length > 120 ? error.message.slice(0, 120) + "…" : error.message;
    return lang === "zh" ? `操作失败：${clean}` : `Failed: ${clean}`;
  }
  return lang === "zh" ? "操作失败，请稍后重试" : "Operation failed — please retry";
}
