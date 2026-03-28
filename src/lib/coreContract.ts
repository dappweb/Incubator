import { BrowserProvider, Contract } from "ethers";
import { CORE_CONTRACT_ADDRESS } from "../config";

const coreAbi = [
  "function purchaseMachine(uint256 quantity, address referrer) external",
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
  "function getUserStats(address user) view returns (uint256 directCount, uint256 teamCount, uint256 directVolume, uint256 teamVolume)",
  "event RewardSettled(uint256 indexed orderId, uint8 indexed poolType, address indexed beneficiary, uint256 amountUSDT)",
];

export function getCoreContract(provider: BrowserProvider) {
  if (!CORE_CONTRACT_ADDRESS) {
    throw new Error("缺少 VITE_CORE_CONTRACT_ADDRESS 配置");
  }

  return new Contract(CORE_CONTRACT_ADDRESS, coreAbi, provider);
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
  return contract.getMachineOrder(orderId);
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
  referrer: string,
) {
  const signer = await provider.getSigner();
  const contract = getCoreContract(provider).connect(signer) as any;
  const tx = await contract.purchaseMachine(quantity, referrer);
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

export async function getContractOwner(provider: BrowserProvider): Promise<string> {
  const contract = getCoreContract(provider) as any;
  return contract.owner();
}

export async function getUserStats(provider: BrowserProvider, user: string) {
  const contract = getCoreContract(provider) as any;
  const stats = await contract.getUserStats(user);
  return {
    directCount: stats.directCount as bigint,
    teamCount: stats.teamCount as bigint,
    directVolume: stats.directVolume as bigint,
    teamVolume: stats.teamVolume as bigint,
  };
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
  return {
    directCount,
    teamCount,
    directVolume,
    teamVolume,
  };
}
