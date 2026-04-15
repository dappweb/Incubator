import { BrowserProvider, Contract } from "ethers";
import { CORE_CONTRACT_ADDRESS } from "../config";

const coreAbi = [
  "function purchaseMachine(uint256 quantity) external",
  "function bindReferrer(address referrer) external",
  "function buyNode() external",
  "function buySuperNode() external",
  "function approveIdentityOperator(uint256 identityId, address operator, bool approved) external",
  "function isIdentityOperatorApproved(uint256 identityId, address operator) view returns (bool)",
  "function machineUnitPrice() view returns (uint256)",
  "function roles(address user) view returns (uint8)",
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
  "function subAdmins(address user) view returns (bool)",
  "function getSubAdmins() view returns (address[])",
  "function setSubAdmin(address account, bool enabled) external",
  "function isOwnerOrSubAdmin(address account) view returns (bool)",
  "function paused() view returns (bool)",
  "function getPoolConfig(uint8 poolType) view returns (address recipient, uint16 bps)",
  "function poolAccumulated(uint8 poolType) view returns (uint256)",
  "function updateMachineUnitPrice(uint256 newPrice) external",
  "function updateNodePrice(uint256 newPrice) external",
  "function updateSuperNodePrice(uint256 newPrice) external",
  "function updatePoolRecipient(uint8 poolType, address newRecipient) external",
  "function updatePoolShare(uint8 poolType, uint16 newBps) external",
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

/** 读取 SuperNode池(2)、Node池(3)、Platform池(4，即USDT契约池)、Leaderboard池(5，即FOMO奖励) 的积累余额 */
export async function getPoolAccumulatedBalances(provider: BrowserProvider): Promise<{
  superNodePool: bigint;
  nodePool: bigint;
  platformPool: bigint;
  leaderboardPool: bigint;
}> {
  const contract = getCoreContract(provider);
  const [superNodePool, nodePool, platformPool, leaderboardPool] = await Promise.all([
    contract.poolAccumulated(2) as Promise<bigint>,
    contract.poolAccumulated(3) as Promise<bigint>,
    contract.poolAccumulated(4) as Promise<bigint>,
    contract.poolAccumulated(5) as Promise<bigint>,
  ]);
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
  const role = await contract.roles(user);
  return Number(role);
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
) {
  const signer = await provider.getSigner();
  const contract = getCoreContract(provider).connect(signer) as any;
  const tx = await contract.purchaseMachine(quantity);
  return tx.wait();
}

export async function bindReferrer(provider: BrowserProvider, referrer: string) {
  const signer = await provider.getSigner();
  const contract = getCoreContract(provider).connect(signer) as any;
  const tx = await contract.bindReferrer(referrer);
  return tx.wait();
}

export async function buyNode(provider: BrowserProvider) {
  const signer = await provider.getSigner();
  const contract = getCoreContract(provider).connect(signer) as any;
  const tx = await contract.buyNode();
  return tx.wait();
}

export async function buySuperNode(provider: BrowserProvider) {
  const signer = await provider.getSigner();
  const contract = getCoreContract(provider).connect(signer) as any;
  const tx = await contract.buySuperNode();
  return tx.wait();
}

export async function approveIdentityOperator(
  provider: BrowserProvider,
  identityId: bigint,
  operator: string,
  approved: boolean,
) {
  const signer = await provider.getSigner();
  const contract = getCoreContract(provider).connect(signer) as any;
  const tx = await contract.approveIdentityOperator(identityId, operator, approved);
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

export type TeamStats = {
  directCount: bigint;
  teamCount: bigint;
  directVolume: bigint;
  teamVolume: bigint;
};

export async function getTeamStats(provider: BrowserProvider, user: string): Promise<TeamStats> {
  const contract = getCoreContract(provider) as any;
  const [directCount, teamCount, directVolume, teamVolume] = await Promise.all([
    contract.directReferralCount(user),
    contract.teamTotalMemberCount(user),
    contract.directReferralVolume(user),
    contract.teamTotalVolume(user),
  ]);
  return { directCount, teamCount, directVolume, teamVolume };
}

export async function transferCoreOwnership(provider: BrowserProvider, newOwner: string) {
  const signer = await provider.getSigner();
  const contract = getCoreContract(provider).connect(signer) as any;
  const tx = await contract.transferOwnership(newOwner);
  return tx.wait();
}
