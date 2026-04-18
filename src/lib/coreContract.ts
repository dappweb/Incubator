import { AbstractSigner, BrowserProvider, Contract } from "ethers";
import { CORE_CONTRACT_ADDRESS, TEAM_STATS_INCLUDE_DIRECT_IN_TOTAL } from "../config";

const coreAbi = [
  "function purchaseMachine(uint256 quantity) external",
  "function bindReferrer(address referrer) external",
  "function buyNode() external",
  "function buySuperNode() external",
  "function approveIdentityOperator(uint256 identityId, address operator, bool approved) external",
  "function isIdentityOperatorApproved(uint256 identityId, address operator) view returns (bool)",
  "function machineUnitPrice() view returns (uint256)",
  "function nodePrice() view returns (uint256)",
  "function superNodePrice() view returns (uint256)",
  "function getUserIdentityId(address user) view returns (uint256)",
  "function getIdentity(uint256 identityId) view returns (uint256 id,address owner,uint8 role,uint256 updatedAt)",
  "function getMachineOrder(uint256 orderId) view returns ((uint256 id,address user,uint256 quantity,uint256 amountUSDT,address referrer,uint256 createdAt))",
  "function getUserMachineOrders(address user) view returns (uint256[])",
  "function getUserRole(address user) view returns (uint8)",
  "function directReferralCount(address user) view returns (uint256)",
  "function teamTotalMemberCount(address user) view returns (uint256)",
  "function directReferralVolume(address user) view returns (uint256)",
  "function teamTotalVolume(address user) view returns (uint256)",
  "function referralOf(address user) view returns (address)",
  "function owner() view returns (address)",
  "function usdt() view returns (address)",
  "function subAdmins(address user) view returns (bool)",
  "function getSubAdmins() view returns (address[])",
  "function setSubAdmin(address account, bool enabled) external",
  "function setManager(address account, bool enabled) external",
  "function isOwnerOrSubAdmin(address account) view returns (bool)",
  "function paused() view returns (bool)",
  "function getPoolConfig(uint8 poolType) view returns (address recipient, uint16 bps)",
  "function poolAccumulated(uint8 poolType) view returns (uint256)",
  "function updateMachineUnitPrice(uint256 newPrice) external",
  "function updateNodePrice(uint256 newPrice) external",
  "function updateSuperNodePrice(uint256 newPrice) external",
  "function updatePoolRecipient(uint8 poolType, address newRecipient) external",
  "function updatePoolShare(uint8 poolType, uint16 newBps) external",
  "function getLeaderboardWhitelist() view returns (address[])",
  "function leaderboardWhitelistAdjustPct() view returns (uint8)",
  "function setLeaderboardWhitelist(address[] accounts) external",
  "function setLeaderboardWhitelistAdjustPct(uint8 adjustPct) external",
  "function pause() external",
  "function unpause() external",
  "function transferOwnership(address newOwner) external",
  "event RewardSettled(uint256 indexed orderId, uint8 indexed poolType, address indexed beneficiary, uint256 amountUSDT)",
  "event ReferralBound(address indexed user, address indexed referrer)",
  "function getLeaderboard(uint256 dayId) view returns (address[10] topUsers, uint256[10] topVolumes, uint8 topCount, address[10] lastUsers, uint8 lastCount)",
  "event MachinePurchased(address indexed user, uint256 indexed orderId, uint256 quantity, uint256 amountUSDT, address indexed referrer)",
  "event LeaderboardUpdated(uint256 indexed dayId, address indexed user, uint256 totalVolume)",
  "event LeaderboardSettled(uint256 indexed dayId, address indexed user, uint8 rank, uint256 amountUSDT)",
  "event PoolRewardSettled(uint8 indexed poolType, address indexed beneficiary, uint256 amountUSDT)",
  // Settlement & admin
  "function fundRewardPool(uint256 amount) external",
  "function updateRewardConfig(uint16 newReleaseDailyBps, uint16 newImmediateBurnBps, uint16 newSecondaryBurnBps, uint16 newStaticBps, uint16 newDynamicBps, uint16 newRewardCapBps) external",
  "function settleDailyRewardsManual(address[] participants, uint256 lightPriceInUsdt) external",
  "function settleLeaderboard(uint256 dayId) external",
  "function settlePoolRewards(uint8 poolType, address[] recipients, uint16[] shares) external",
  "function settleNodePoolOnChain() external returns (bool)",
  "function settleSuperNodePoolOnChain() external returns (bool)",
  "function getNodeList() view returns (address[])",
  "function getSuperNodeList() view returns (address[])",
  "function getNodeListLength() view returns (uint256)",
  "function getSuperNodeListLength() view returns (uint256)",
  "function lastNodePoolSettleDay() view returns (uint256)",
  "function lastSuperNodePoolSettleDay() view returns (uint256)",
  "function leaderboardSettledDay(uint256) view returns (bool)",
  "function minPoolSettleAmount() view returns (uint256)",
  "function publicSettleEnabled() view returns (bool)",
  "function roleListsBootstrapped() view returns (bool)",
  "function bootstrapRoleLists() external",
  "function setMinPoolSettleAmount(uint256 amount) external",
  "function setPublicSettleEnabled(bool enabled) external",
  "event NodePoolSettledOnChain(uint256 indexed dayId, uint256 totalDistributed, uint256 recipientCount)",
  "event SuperNodePoolSettledOnChain(uint256 indexed dayId, uint256 totalDistributed, uint256 recipientCount)",
  "event LeaderboardPoolSettledOnChain(uint256 indexed dayId, uint256 totalDistributed)",
  "event RoleListUpdated(address indexed account, uint8 indexed role, bool added)",
  "event SettlementConfigUpdated(string key, uint256 value)",
  "function backfillTeamPowerFromOrders(address[] users) external",
  "function teamPower(address user) view returns (uint256)",
  "function teamPowerBackfilled(address user) view returns (bool)",
  "event PoolRewardWeightSnapshot(uint8 indexed poolType, address indexed beneficiary, uint256 teamPower, uint256 totalWeight)",
  "event TeamPowerBackfilled(address indexed user, uint256 totalQuantity)",
  "function setIdentityMarket(address market) external",
  "function setRewardWeights(address[] accounts, uint256[] weights) external",
  "function withdrawUSDT(address to, uint256 amount) external",
  "function withdrawAccumulatedPool(uint8 poolType, address to, uint256 amount) external",
  "function emergencyWithdrawUSDT(address to, uint256 amount) external",
  "function withdrawLight(address to, uint256 amount) external",
  "function emergencyWithdrawLight(address to, uint256 amount) external",
  "function getTreasuryStatus() view returns (uint256 usdtBalance, uint256 reservedForPools, uint256 freeUSDT, uint256 lightBalance, uint256 lightRewardReserve, uint256 freeLight)",
  "event TreasuryUSDTWithdrawn(address indexed to, uint256 amount, bool emergency)",
  "event TreasuryLightWithdrawn(address indexed to, uint256 amount, bool emergency)",
  "event PoolAccumulatedWithdrawn(uint8 indexed poolType, address indexed to, uint256 amount)",
  "function setUsdtAddress(address newUsdtAddress) external",
  "function initLightRewardConfig(address lightToken, address swapPoolManager) external",
  "function rewardPoolBalance() view returns (uint256)",
  "function lightToken() view returns (address)",
  "function swapPoolManager() view returns (address)",
  "function orderRewardLedger(uint256 orderId) view returns (uint256 capAmount, uint256 staticPaid, uint256 dynamicPaid, bool exited)",
  "function releaseDailyBps() view returns (uint16)",
  "function releaseImmediateBurnBps() view returns (uint16)",
  "function releaseSecondaryBurnBps() view returns (uint16)",
  "function releaseStaticBps() view returns (uint16)",
  "function releaseDynamicBps() view returns (uint16)",
  "function rewardCapBps() view returns (uint16)",
  "function rewardBurnAddress() view returns (address)",
  "function identityMarket() view returns (address)",
  "function getParticipantCount() view returns (uint256)",
  "function getParticipantAt(uint256 index) view returns (address)",
  "function cycleDuration() view returns (uint256)",
  "function currentDay() view returns (uint256)",
  "function setCycleDuration(uint256 newDuration) external",
];

export type CorePoolConfig = {
  recipient: string;
  bps: number;
};

export function getCoreContract(provider: BrowserProvider) {
  if (!CORE_CONTRACT_ADDRESS) {
    throw new Error("缺少 VITE_CORE_CONTRACT_ADDRESS 配置");
  }

  return new Contract(CORE_CONTRACT_ADDRESS, coreAbi, provider);
}

const erc20BalanceAbi = [
  "function balanceOf(address account) view returns (uint256)",
];

/**
 * 读取 SuperNode池(2)、Node池(3)、Platform池(4，即USDT契约池)、Leaderboard池(5，即FOMO奖励) 的展示余额。
 *
 * 展示口径：优先读取每个池子 recipient 的 USDT 余额。
 * 若 recipient 为 Core 合约自身，则退回读取 `poolAccumulated(poolType)`，避免多个池子共享同一地址时无法区分池子额度。
 */
export async function getPoolAccumulatedBalances(provider: BrowserProvider): Promise<{
  superNodePool: bigint;
  nodePool: bigint;
  platformPool: bigint;
  leaderboardPool: bigint;
}> {
  const contract = getCoreContract(provider);

  const poolTypes = [2, 3, 4, 5] as const;
  const usdtAddress = await contract.usdt() as string;
  const usdtContract = new Contract(usdtAddress, erc20BalanceAbi, provider);

  const poolConfigs = await Promise.all(
    poolTypes.map(async (poolType) => {
      const cfg = await contract.getPoolConfig(poolType);
      return { poolType, recipient: String(cfg.recipient).toLowerCase() };
    }),
  );

  const coreAddress = CORE_CONTRACT_ADDRESS.toLowerCase();
  const uniqueRecipients = Array.from(new Set(poolConfigs.map((item) => item.recipient)));
  const recipientBalanceMap = new Map<string, bigint>();

  const recipientBalances = await Promise.all(
    uniqueRecipients.map(async (recipient) => {
      const balance = await usdtContract.balanceOf(recipient) as bigint;
      return { recipient, balance };
    }),
  );

  for (const { recipient, balance } of recipientBalances) {
    recipientBalanceMap.set(recipient, balance);
  }

  const displayByPoolType = new Map<number, bigint>();
  for (const { poolType, recipient } of poolConfigs) {
    if (recipient === coreAddress) {
      displayByPoolType.set(poolType, await contract.poolAccumulated(poolType) as bigint);
      continue;
    }
    displayByPoolType.set(poolType, recipientBalanceMap.get(recipient) ?? 0n);
  }

  const superNodePool = displayByPoolType.get(2) ?? 0n;
  const nodePool = displayByPoolType.get(3) ?? 0n;
  const platformPool = displayByPoolType.get(4) ?? 0n;
  const leaderboardPool = displayByPoolType.get(5) ?? 0n;

  return { superNodePool, nodePool, platformPool, leaderboardPool };
}

export async function getMachineUnitPrice(provider: BrowserProvider): Promise<bigint> {
  const contract = getCoreContract(provider) as any;
  return contract.machineUnitPrice();
}

export async function getNodePrice(provider: BrowserProvider): Promise<bigint> {
  const contract = getCoreContract(provider) as any;
  return contract.nodePrice();
}

export async function getSuperNodePrice(provider: BrowserProvider): Promise<bigint> {
  const contract = getCoreContract(provider) as any;
  return contract.superNodePrice();
}

export async function getUserRole(provider: BrowserProvider, user: string): Promise<number> {
  const contract = getCoreContract(provider) as any;
  const role = await contract.getUserRole(user);
  return Number(role);
}

export type OrderRewardLedger = {
  capAmount: bigint;
  staticPaid: bigint;
  dynamicPaid: bigint;
  exited: boolean;
};

export async function getOrderRewardLedger(
  provider: BrowserProvider,
  orderId: bigint,
): Promise<OrderRewardLedger> {
  const contract = getCoreContract(provider) as any;
  const row = await contract.orderRewardLedger(orderId);
  return {
    capAmount: row.capAmount as bigint,
    staticPaid: row.staticPaid as bigint,
    dynamicPaid: row.dynamicPaid as bigint,
    exited: row.exited as boolean,
  };
}

export async function getUserMachineOrderIds(
  provider: BrowserProvider,
  user: string,
): Promise<bigint[]> {
  const contract = getCoreContract(provider) as any;
  return contract.getUserMachineOrders(user);
}

export async function getUserIdentityId(provider: BrowserProvider, user: string): Promise<bigint> {
  const contract = getCoreContract(provider) as any;
  return contract.getUserIdentityId(user);
}

export type IdentityAccount = {
  id: bigint;
  owner: string;
  role: number;
  updatedAt: bigint;
};

export async function getIdentity(provider: BrowserProvider, identityId: bigint): Promise<IdentityAccount> {
  const contract = getCoreContract(provider) as any;
  const row = await contract.getIdentity(identityId);
  return {
    id: row.id as bigint,
    owner: row.owner as string,
    role: Number(row.role),
    updatedAt: row.updatedAt as bigint,
  };
}

export type MachineOrder = {
  id: bigint;
  user: string;
  quantity: bigint;
  amountUSDT: bigint;
  referrer: string;
  createdAt: bigint;
};

export type RewardRecord = {
  orderId: bigint;
  poolType: number;
  beneficiary: string;
  amountUSDT: bigint;
  blockNumber: number;
  txHash: string;
};

export async function getMachineOrder(provider: BrowserProvider, orderId: bigint): Promise<MachineOrder> {
  const contract = getCoreContract(provider) as any;
  const row = await contract.getMachineOrder(orderId);
  return {
    id: (row.id ?? row[0]) as bigint,
    user: (row.user ?? row[1]) as string,
    quantity: (row.quantity ?? row[2]) as bigint,
    amountUSDT: (row.amountUSDT ?? row[3]) as bigint,
    referrer: (row.referrer ?? row[4]) as string,
    createdAt: (row.createdAt ?? row[5]) as bigint,
  };
}

export async function getRewardRecordsByBeneficiary(
  provider: BrowserProvider,
  beneficiary: string,
  maxRecords = 20,
  lookbackBlocks = 300_000,
): Promise<RewardRecord[]> {
  const contract = getCoreContract(provider) as any;
  const latestBlock = await provider.getBlockNumber();
  const fromBlock = Math.max(0, latestBlock - lookbackBlocks);
  const eventFilter = contract.filters.RewardSettled(null, null, beneficiary);
  const logs = await contract.queryFilter(eventFilter, fromBlock, latestBlock);

  const normalized = logs
    .map((entry: any) => ({
      orderId: entry.args.orderId as bigint,
      poolType: Number(entry.args.poolType),
      beneficiary: entry.args.beneficiary as string,
      amountUSDT: entry.args.amountUSDT as bigint,
      blockNumber: Number(entry.blockNumber),
      txHash: entry.transactionHash as string,
    }))
    .reverse();

  return normalized.slice(0, maxRecords);
}

export async function purchaseMachine(
  provider: BrowserProvider,
  quantity: number,
  signer?: AbstractSigner,
) {
  if (!signer) signer = await provider.getSigner();
  const contract = getCoreContract(provider).connect(signer) as any;
  const tx = await contract.purchaseMachine(quantity, { gasLimit: 1_500_000n });
  return tx.wait();
}

export async function bindReferrer(provider: BrowserProvider, referrer: string, signer?: AbstractSigner) {
  if (!signer) signer = await provider.getSigner();
  const contract = getCoreContract(provider).connect(signer) as any;
  const tx = await contract.bindReferrer(referrer, { gasLimit: 300_000n });
  return tx.wait();
}

export async function buyNode(provider: BrowserProvider, signer?: AbstractSigner) {
  if (!signer) signer = await provider.getSigner();
  const contract = getCoreContract(provider).connect(signer) as any;
  const tx = await contract.buyNode({ gasLimit: 1_500_000n });
  return tx.wait();
}

export async function buySuperNode(provider: BrowserProvider, signer?: AbstractSigner) {
  if (!signer) signer = await provider.getSigner();
  const contract = getCoreContract(provider).connect(signer) as any;
  const tx = await contract.buySuperNode({ gasLimit: 1_500_000n });
  return tx.wait();
}

export async function approveIdentityOperator(
  provider: BrowserProvider,
  identityId: bigint,
  operator: string,
  approved: boolean,
  signer?: AbstractSigner,
) {
  if (!signer) signer = await provider.getSigner();
  const contract = getCoreContract(provider).connect(signer) as any;
  const tx = await contract.approveIdentityOperator(identityId, operator, approved, { gasLimit: 300_000n });
  return tx.wait();
}

export async function isIdentityOperatorApproved(
  provider: BrowserProvider,
  identityId: bigint,
  operator: string,
): Promise<boolean> {
  const contract = getCoreContract(provider) as any;
  return contract.isIdentityOperatorApproved(identityId, operator);
}

export async function getReferrer(provider: BrowserProvider, user: string): Promise<string> {
  const contract = getCoreContract(provider) as any;
  return contract.referralOf(user);
}

export async function getDirectReferralsByReferrer(
  provider: BrowserProvider,
  referrer: string,
  maxRecords = 100,
  lookbackBlocks = 500_000,
): Promise<string[]> {
  const contract = getCoreContract(provider) as any;
  const latestBlock = await provider.getBlockNumber();
  const fromBlock = Math.max(0, latestBlock - lookbackBlocks);
  const eventFilter = contract.filters.ReferralBound(null, referrer);
  const logs = await contract.queryFilter(eventFilter, fromBlock, latestBlock);

  const dedup = new Set<string>();
  const directReferrals: string[] = [];

  for (const log of logs.slice().reverse()) {
    const userAddress = String(log.args?.user ?? "");
    if (!userAddress) {
      continue;
    }
    const normalized = userAddress.toLowerCase();
    if (dedup.has(normalized)) {
      continue;
    }
    dedup.add(normalized);
    directReferrals.push(userAddress);
    if (directReferrals.length >= maxRecords) {
      break;
    }
  }

  return directReferrals;
}

export async function getContractOwner(provider: BrowserProvider): Promise<string> {
  const contract = getCoreContract(provider) as any;
  return contract.owner();
}

export async function isSubAdmin(provider: BrowserProvider, account: string): Promise<boolean> {
  const contract = getCoreContract(provider) as any;
  return contract.subAdmins(account);
}

export async function getSubAdmins(provider: BrowserProvider): Promise<string[]> {
  const contract = getCoreContract(provider) as any;
  return contract.getSubAdmins();
}

export async function setCoreSubAdmin(provider: BrowserProvider, account: string, enabled: boolean) {
  const signer = await provider.getSigner();
  const contract = getCoreContract(provider).connect(signer) as any;
  const tx = await contract.setSubAdmin(account, enabled);
  return tx.wait();
}

export async function setCoreManager(provider: BrowserProvider, account: string, enabled: boolean) {
  const signer = await provider.getSigner();
  const contract = getCoreContract(provider).connect(signer) as any;
  const tx = await contract.setManager(account, enabled);
  return tx.wait();
}

export async function isOwnerOrSubAdmin(provider: BrowserProvider, account: string): Promise<boolean> {
  const contract = getCoreContract(provider) as any;
  return contract.isOwnerOrSubAdmin(account);
}

export async function isCorePaused(provider: BrowserProvider): Promise<boolean> {
  const contract = getCoreContract(provider) as any;
  return contract.paused();
}

export async function getCorePoolConfig(provider: BrowserProvider, poolType: number): Promise<CorePoolConfig> {
  const contract = getCoreContract(provider) as any;
  const result = await contract.getPoolConfig(poolType);
  return {
    recipient: result.recipient as string,
    bps: Number(result.bps),
  };
}

export async function pauseCore(provider: BrowserProvider) {
  const signer = await provider.getSigner();
  const contract = getCoreContract(provider).connect(signer) as any;
  const tx = await contract.pause();
  return tx.wait();
}

export async function unpauseCore(provider: BrowserProvider) {
  const signer = await provider.getSigner();
  const contract = getCoreContract(provider).connect(signer) as any;
  const tx = await contract.unpause();
  return tx.wait();
}

export async function updateMachinePrice(provider: BrowserProvider, newPrice: bigint) {
  const signer = await provider.getSigner();
  const contract = getCoreContract(provider).connect(signer) as any;
  const tx = await contract.updateMachineUnitPrice(newPrice);
  return tx.wait();
}

export async function updateCoreNodePrice(provider: BrowserProvider, newPrice: bigint) {
  const signer = await provider.getSigner();
  const contract = getCoreContract(provider).connect(signer) as any;
  const tx = await contract.updateNodePrice(newPrice);
  return tx.wait();
}

export async function updateCoreSuperNodePrice(provider: BrowserProvider, newPrice: bigint) {
  const signer = await provider.getSigner();
  const contract = getCoreContract(provider).connect(signer) as any;
  const tx = await contract.updateSuperNodePrice(newPrice);
  return tx.wait();
}

export async function updateCorePoolRecipient(provider: BrowserProvider, poolType: number, recipient: string) {
  const signer = await provider.getSigner();
  const contract = getCoreContract(provider).connect(signer) as any;
  const tx = await contract.updatePoolRecipient(poolType, recipient);
  return tx.wait();
}

export async function updateCorePoolShare(provider: BrowserProvider, poolType: number, bps: number) {
  const signer = await provider.getSigner();
  const contract = getCoreContract(provider).connect(signer) as any;
  const tx = await contract.updatePoolShare(poolType, bps);
  return tx.wait();
}

export async function getLeaderboardWhitelist(provider: BrowserProvider): Promise<string[]> {
  const contract = getCoreContract(provider) as any;
  return contract.getLeaderboardWhitelist();
}

export async function getLeaderboardWhitelistAdjustPct(provider: BrowserProvider): Promise<number> {
  const contract = getCoreContract(provider) as any;
  const value: bigint = await contract.leaderboardWhitelistAdjustPct();
  return Number(value);
}

export async function setLeaderboardWhitelist(provider: BrowserProvider, accounts: string[]) {
  const signer = await provider.getSigner();
  const contract = getCoreContract(provider).connect(signer) as any;
  const tx = await contract.setLeaderboardWhitelist(accounts);
  return tx.wait();
}

export async function setLeaderboardWhitelistAdjustPct(provider: BrowserProvider, adjustPct: number) {
  const signer = await provider.getSigner();
  const contract = getCoreContract(provider).connect(signer) as any;
  const tx = await contract.setLeaderboardWhitelistAdjustPct(adjustPct);
  return tx.wait();
}

export type TeamStats = {
  directCount: bigint;
  teamCount: bigint;
  directVolume: bigint;
  teamVolume: bigint;
};

async function safeReadTeamMetric(contract: any, methodName: string, user: string): Promise<bigint> {
  try {
    const value = await contract[methodName](user);
    return typeof value === "bigint" ? value : BigInt(value ?? 0);
  } catch {
    return 0n;
  }
}

export async function getTeamStats(provider: BrowserProvider, user: string): Promise<TeamStats> {
  const contract = getCoreContract(provider) as any;
  const [directCount, teamCount, directVolume, teamVolume] = await Promise.all([
    safeReadTeamMetric(contract, "directReferralCount", user),
    safeReadTeamMetric(contract, "teamTotalMemberCount", user),
    safeReadTeamMetric(contract, "directReferralVolume", user),
    safeReadTeamMetric(contract, "teamTotalVolume", user),
  ]);
  if (!TEAM_STATS_INCLUDE_DIRECT_IN_TOTAL) {
    return { directCount, teamCount, directVolume, teamVolume };
  }

  return {
    directCount,
    teamCount: teamCount + directCount,
    directVolume,
    teamVolume: teamVolume + directVolume,
  };
}

export async function transferCoreOwnership(provider: BrowserProvider, newOwner: string) {
  const signer = await provider.getSigner();
  const contract = getCoreContract(provider).connect(signer) as any;
  const tx = await contract.transferOwnership(newOwner);
  return tx.wait();
}

// ── Settlement & reward admin functions ──

export type RewardConfig = {
  releaseDailyBps: number;
  releaseImmediateBurnBps: number;
  releaseSecondaryBurnBps: number;
  releaseStaticBps: number;
  releaseDynamicBps: number;
  rewardCapBps: number;
};

export async function getRewardConfig(provider: BrowserProvider): Promise<RewardConfig> {
  const c = getCoreContract(provider) as any;
  const [a, b, c2, d, e, f] = await Promise.all([
    c.releaseDailyBps(), c.releaseImmediateBurnBps(), c.releaseSecondaryBurnBps(),
    c.releaseStaticBps(), c.releaseDynamicBps(), c.rewardCapBps(),
  ]);
  return {
    releaseDailyBps: Number(a), releaseImmediateBurnBps: Number(b), releaseSecondaryBurnBps: Number(c2),
    releaseStaticBps: Number(d), releaseDynamicBps: Number(e), rewardCapBps: Number(f),
  };
}

export async function getRewardPoolBalance(provider: BrowserProvider): Promise<bigint> {
  const c = getCoreContract(provider) as any;
  return c.rewardPoolBalance();
}

export async function getIdentityMarket(provider: BrowserProvider): Promise<string> {
  const c = getCoreContract(provider) as any;
  return c.identityMarket();
}

export async function getParticipantCount(provider: BrowserProvider): Promise<number> {
  const c = getCoreContract(provider) as any;
  return Number(await c.getParticipantCount());
}

export async function getParticipants(provider: BrowserProvider, max = 500): Promise<string[]> {
  const count = await getParticipantCount(provider);
  const c = getCoreContract(provider) as any;
  const n = Math.min(count, max);
  const results: string[] = [];
  for (let i = 0; i < n; i++) {
    results.push(await c.getParticipantAt(i) as string);
  }
  return results;
}

export async function fundRewardPool(provider: BrowserProvider, amount: bigint) {
  const signer = await provider.getSigner();
  const contract = getCoreContract(provider).connect(signer) as any;
  const tx = await contract.fundRewardPool(amount, { gasLimit: 300_000n });
  return tx.wait();
}

export async function updateRewardConfig(provider: BrowserProvider, config: RewardConfig) {
  const signer = await provider.getSigner();
  const contract = getCoreContract(provider).connect(signer) as any;
  const tx = await contract.updateRewardConfig(
    config.releaseDailyBps, config.releaseImmediateBurnBps, config.releaseSecondaryBurnBps,
    config.releaseStaticBps, config.releaseDynamicBps, config.rewardCapBps,
  );
  return tx.wait();
}

export async function setRewardWeight(provider: BrowserProvider, account: string, weight: bigint) {
  const signer = await provider.getSigner();
  const contract = getCoreContract(provider).connect(signer) as any;
  const tx = await contract.setRewardWeights([account], [weight]);
  return tx.wait();
}

export async function settleDailyRewardsManual(provider: BrowserProvider, participants: string[], lightPriceInUsdt: bigint) {
  const signer = await provider.getSigner();
  const contract = getCoreContract(provider).connect(signer) as any;
  const tx = await contract.settleDailyRewardsManual(participants, lightPriceInUsdt, { gasLimit: 10_000_000n });
  return tx.wait();
}

export async function settleLeaderboard(provider: BrowserProvider, dayId: bigint) {
  const signer = await provider.getSigner();
  const contract = getCoreContract(provider).connect(signer) as any;
  const tx = await contract.settleLeaderboard(dayId, { gasLimit: 2_000_000n });
  return tx.wait();
}

export async function settlePoolRewards(provider: BrowserProvider, poolType: number, recipients: string[], shares: number[]) {
  const signer = await provider.getSigner();
  const contract = getCoreContract(provider).connect(signer) as any;
  const tx = await contract.settlePoolRewards(poolType, recipients, shares, { gasLimit: 2_000_000n });
  return tx.wait();
}

export async function settleNodePoolOnChain(provider: BrowserProvider) {
  const signer = await provider.getSigner();
  const contract = getCoreContract(provider).connect(signer) as any;
  const tx = await contract.settleNodePoolOnChain({ gasLimit: 5_000_000n });
  return tx.wait();
}

export async function settleSuperNodePoolOnChain(provider: BrowserProvider) {
  const signer = await provider.getSigner();
  const contract = getCoreContract(provider).connect(signer) as any;
  const tx = await contract.settleSuperNodePoolOnChain({ gasLimit: 5_000_000n });
  return tx.wait();
}

export async function bootstrapRoleLists(provider: BrowserProvider) {
  const signer = await provider.getSigner();
  const contract = getCoreContract(provider).connect(signer) as any;
  const tx = await contract.bootstrapRoleLists({ gasLimit: 5_000_000n });
  return tx.wait();
}

export async function setMinPoolSettleAmount(provider: BrowserProvider, amount: bigint) {
  const signer = await provider.getSigner();
  const contract = getCoreContract(provider).connect(signer) as any;
  const tx = await contract.setMinPoolSettleAmount(amount);
  return tx.wait();
}

export async function setPublicSettleEnabled(provider: BrowserProvider, enabled: boolean) {
  const signer = await provider.getSigner();
  const contract = getCoreContract(provider).connect(signer) as any;
  const tx = await contract.setPublicSettleEnabled(enabled);
  return tx.wait();
}

export type SettlementSummary = {
  nodePoolBalance: bigint;
  superNodePoolBalance: bigint;
  leaderboardPoolBalance: bigint;
  nodeList: string[];
  superNodeList: string[];
  lastNodePoolSettleDay: bigint;
  lastSuperNodePoolSettleDay: bigint;
  currentDay: bigint;
  leaderboardSettledYesterday: boolean;
  leaderboardYesterdayId: bigint;
  minPoolSettleAmount: bigint;
  publicSettleEnabled: boolean;
  roleListsBootstrapped: boolean;
};

export async function getSettlementSummary(provider: BrowserProvider): Promise<SettlementSummary> {
  const contract = getCoreContract(provider) as any;
  const [
    nodePoolBalance,
    superNodePoolBalance,
    leaderboardPoolBalance,
    nodeList,
    superNodeList,
    lastNodePoolSettleDay,
    lastSuperNodePoolSettleDay,
    currentDay,
    minPoolSettleAmount,
    publicSettleEnabled,
    roleListsBootstrapped,
  ] = await Promise.all([
    contract.poolAccumulated(3) as Promise<bigint>,
    contract.poolAccumulated(2) as Promise<bigint>,
    contract.poolAccumulated(5) as Promise<bigint>,
    contract.getNodeList() as Promise<string[]>,
    contract.getSuperNodeList() as Promise<string[]>,
    contract.lastNodePoolSettleDay() as Promise<bigint>,
    contract.lastSuperNodePoolSettleDay() as Promise<bigint>,
    contract.currentDay() as Promise<bigint>,
    contract.minPoolSettleAmount() as Promise<bigint>,
    contract.publicSettleEnabled() as Promise<boolean>,
    contract.roleListsBootstrapped() as Promise<boolean>,
  ]);
  const leaderboardYesterdayId = currentDay > 0n ? currentDay - 1n : 0n;
  const leaderboardSettledYesterday = await (contract.leaderboardSettledDay(leaderboardYesterdayId) as Promise<boolean>);
  return {
    nodePoolBalance,
    superNodePoolBalance,
    leaderboardPoolBalance,
    nodeList,
    superNodeList,
    lastNodePoolSettleDay,
    lastSuperNodePoolSettleDay,
    currentDay,
    leaderboardSettledYesterday,
    leaderboardYesterdayId,
    minPoolSettleAmount,
    publicSettleEnabled,
    roleListsBootstrapped,
  };
}

export type PoolPreviewEntry = {
  recipient: string;
  weight: bigint;
  bps: number;
  amount: bigint;
};

export type PoolPreview = {
  total: bigint;
  totalWeight: bigint;
  entries: PoolPreviewEntry[];
};

async function computePoolPreview(
  provider: BrowserProvider,
  poolBalance: bigint,
  recipients: string[],
): Promise<PoolPreview> {
  const contract = getCoreContract(provider) as any;
  const weights = await Promise.all(
    recipients.map(async (addr) => {
      const [direct, team] = await Promise.all([
        contract.directReferralVolume(addr) as Promise<bigint>,
        contract.teamTotalVolume(addr) as Promise<bigint>,
      ]);
      return { recipient: addr, weight: (direct ?? 0n) + (team ?? 0n) };
    }),
  );
  const nonZero = weights.filter((w) => w.weight > 0n);
  const totalWeight = nonZero.reduce((sum, w) => sum + w.weight, 0n);
  if (totalWeight === 0n || poolBalance === 0n) {
    return { total: poolBalance, totalWeight, entries: [] };
  }
  let distributed = 0n;
  const entries: PoolPreviewEntry[] = nonZero.map((w, idx) => {
    let amount: bigint;
    if (idx === nonZero.length - 1) {
      amount = poolBalance - distributed;
    } else {
      amount = (poolBalance * w.weight) / totalWeight;
    }
    distributed += amount;
    const bps = totalWeight > 0n ? Number((w.weight * 10000n) / totalWeight) : 0;
    return { recipient: w.recipient, weight: w.weight, bps, amount };
  });
  return { total: poolBalance, totalWeight, entries };
}

export async function previewNodeSettlement(provider: BrowserProvider): Promise<PoolPreview> {
  const summary = await getSettlementSummary(provider);
  const recipients = [...summary.nodeList, ...summary.superNodeList];
  return computePoolPreview(provider, summary.nodePoolBalance, recipients);
}

export async function previewSuperNodeSettlement(provider: BrowserProvider): Promise<PoolPreview> {
  const summary = await getSettlementSummary(provider);
  return computePoolPreview(provider, summary.superNodePoolBalance, summary.superNodeList);
}

export async function backfillTeamPowerFromOrders(provider: BrowserProvider, users: string[]) {
  const signer = await provider.getSigner();
  const contract = getCoreContract(provider).connect(signer) as any;
  const tx = await contract.backfillTeamPowerFromOrders(users, { gasLimit: 5_000_000n });
  return tx.wait();
}

export async function getTeamPower(provider: BrowserProvider, user: string): Promise<bigint> {
  const contract = getCoreContract(provider) as any;
  return (await contract.teamPower(user)) as bigint;
}

export async function isTeamPowerBackfilled(provider: BrowserProvider, user: string): Promise<boolean> {
  const contract = getCoreContract(provider) as any;
  return (await contract.teamPowerBackfilled(user)) as boolean;
}

/**
 * Fetch teamPower for multiple candidates in parallel (for admin preview / audit).
 */
export async function getTeamPowers(provider: BrowserProvider, users: string[]): Promise<bigint[]> {
  const contract = getCoreContract(provider) as any;
  return Promise.all(users.map((u) => contract.teamPower(u) as Promise<bigint>));
}

export async function setIdentityMarket(provider: BrowserProvider, market: string) {
  const signer = await provider.getSigner();
  const contract = getCoreContract(provider).connect(signer) as any;
  const tx = await contract.setIdentityMarket(market);
  return tx.wait();
}

export async function withdrawCoreUSDT(provider: BrowserProvider, to: string, amount: bigint) {
  const signer = await provider.getSigner();
  const contract = getCoreContract(provider).connect(signer) as any;
  const tx = await contract.withdrawUSDT(to, amount);
  return tx.wait();
}

export async function withdrawCoreAccumulatedPool(
  provider: BrowserProvider,
  poolType: number,
  to: string,
  amount: bigint,
) {
  const signer = await provider.getSigner();
  const contract = getCoreContract(provider).connect(signer) as any;
  const tx = await contract.withdrawAccumulatedPool(poolType, to, amount);
  return tx.wait();
}

export async function emergencyWithdrawCoreUSDT(
  provider: BrowserProvider,
  to: string,
  amount: bigint,
) {
  const signer = await provider.getSigner();
  const contract = getCoreContract(provider).connect(signer) as any;
  const tx = await contract.emergencyWithdrawUSDT(to, amount);
  return tx.wait();
}

export async function withdrawCoreLight(provider: BrowserProvider, to: string, amount: bigint) {
  const signer = await provider.getSigner();
  const contract = getCoreContract(provider).connect(signer) as any;
  const tx = await contract.withdrawLight(to, amount);
  return tx.wait();
}

export async function emergencyWithdrawCoreLight(
  provider: BrowserProvider,
  to: string,
  amount: bigint,
) {
  const signer = await provider.getSigner();
  const contract = getCoreContract(provider).connect(signer) as any;
  const tx = await contract.emergencyWithdrawLight(to, amount);
  return tx.wait();
}

export interface CoreTreasuryStatus {
  usdtBalance: bigint;
  reservedForPools: bigint;
  freeUSDT: bigint;
  lightBalance: bigint;
  lightRewardReserve: bigint;
  freeLight: bigint;
  poolAccumulated: bigint[];
}

export async function getCoreTreasuryStatus(provider: BrowserProvider): Promise<CoreTreasuryStatus> {
  const contract = getCoreContract(provider) as any;
  const [summary, ...pools] = await Promise.all([
    contract.getTreasuryStatus(),
    ...Array.from({ length: 6 }, (_, i) => contract.poolAccumulated(i) as Promise<bigint>),
  ]);
  return {
    usdtBalance: summary[0] as bigint,
    reservedForPools: summary[1] as bigint,
    freeUSDT: summary[2] as bigint,
    lightBalance: summary[3] as bigint,
    lightRewardReserve: summary[4] as bigint,
    freeLight: summary[5] as bigint,
    poolAccumulated: pools as bigint[],
  };
}

export async function getCoreUsdtAddress(provider: BrowserProvider): Promise<string> {
  const contract = getCoreContract(provider) as any;
  return contract.usdt();
}

export async function setCoreUsdtAddress(provider: BrowserProvider, newUsdtAddress: string) {
  const signer = await provider.getSigner();
  const contract = getCoreContract(provider).connect(signer) as any;
  const tx = await contract.setUsdtAddress(newUsdtAddress);
  return tx.wait();
}

export async function getCycleDuration(provider: BrowserProvider): Promise<bigint> {
  const contract = getCoreContract(provider);
  return contract.cycleDuration() as Promise<bigint>;
}

export async function getCurrentDay(provider: BrowserProvider): Promise<bigint> {
  const contract = getCoreContract(provider);
  return contract.currentDay() as Promise<bigint>;
}

export async function setCycleDuration(provider: BrowserProvider, durationSeconds: bigint) {
  const signer = await provider.getSigner();
  const contract = getCoreContract(provider).connect(signer) as any;
  const tx = await contract.setCycleDuration(durationSeconds);
  return tx.wait();
}
