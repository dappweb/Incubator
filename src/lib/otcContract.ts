import { AbstractSigner, BrowserProvider, Contract } from "ethers";
import { OTC_CONTRACT_ADDRESS } from "../config";

const otcAbi = [
  "function usdt() view returns (address)",
  "function createOrder(uint256 identityId, uint256 priceUSDT)",
  "function cancelOrder(uint256 orderId)",
  "function fillOrder(uint256 orderId)",
  "function getOrder(uint256 orderId) view returns ((uint256 id,uint256 identityId,uint8 role,address seller,uint256 priceUSDT,bool active))",
  "function getActiveOrderIds() view returns (uint256[])",
  "function getIdentityActiveOrder(uint256 identityId) view returns (uint256)",
  "function lastTradePriceByRole(uint8 role) view returns (uint256)",
  "function feeBps() view returns (uint256)",
  "function feeRecipient() view returns (address)",
  "function updateFeeConfig(uint256 newFeeBps, address newRecipient) external",
  "function setUsdtAddress(address newUsdtAddress) external",
  "function cleanupLowerOrders(uint8 role, uint256 maxCancels) external",
  "function getActiveOrdersCount() view returns (uint256)",
];

export type OtcFeeConfig = {
  feeBps: number;
  feeRecipient: string;
};

export type OtcOrder = {
  id: bigint;
  identityId: bigint;
  role: number;
  seller: string;
  priceUSDT: bigint;
  active: boolean;
};

export function getOtcContract(provider: BrowserProvider) {
  if (!OTC_CONTRACT_ADDRESS) {
    throw new Error("缺少 VITE_OTC_CONTRACT_ADDRESS 配置");
  }

  return new Contract(OTC_CONTRACT_ADDRESS, otcAbi, provider);
}

export async function getActiveOrderIds(provider: BrowserProvider): Promise<bigint[]> {
  const contract = getOtcContract(provider) as any;
  return contract.getActiveOrderIds();
}

export async function getOrder(provider: BrowserProvider, orderId: bigint): Promise<OtcOrder> {
  const contract = getOtcContract(provider) as any;
  const row = await contract.getOrder(orderId);
  return {
    id: BigInt(row.id),
    identityId: BigInt(row.identityId),
    role: Number(row.role),
    seller: row.seller,
    priceUSDT: BigInt(row.priceUSDT),
    active: Boolean(row.active),
  };
}

export async function createOtcOrder(
  provider: BrowserProvider,
  identityId: bigint,
  priceUSDT: bigint,
  signer?: AbstractSigner,
) {
  if (!signer) signer = await provider.getSigner();
  const contract = getOtcContract(provider).connect(signer) as any;
  const tx = await contract.createOrder(identityId, priceUSDT, { gasLimit: 500_000n });
  return tx.wait();
}

export async function cancelOtcOrder(provider: BrowserProvider, orderId: bigint, signer?: AbstractSigner) {
  if (!signer) signer = await provider.getSigner();
  const contract = getOtcContract(provider).connect(signer) as any;
  const tx = await contract.cancelOrder(orderId, { gasLimit: 300_000n });
  return tx.wait();
}

export async function fillOtcOrder(provider: BrowserProvider, orderId: bigint, signer?: AbstractSigner) {
  if (!signer) signer = await provider.getSigner();
  const contract = getOtcContract(provider).connect(signer) as any;
  const tx = await contract.fillOrder(orderId, { gasLimit: 800_000n });
  return tx.wait();
}

export async function getOtcFeeBps(provider: BrowserProvider): Promise<number> {
  const contract = getOtcContract(provider) as any;
  const value = (await contract.feeBps()) as bigint;
  return Number(value);
}

export async function getOtcFeeConfig(provider: BrowserProvider): Promise<OtcFeeConfig> {
  const contract = getOtcContract(provider) as any;
  const [feeBps, feeRecipient] = await Promise.all([contract.feeBps(), contract.feeRecipient()]);
  return {
    feeBps: Number(feeBps),
    feeRecipient: feeRecipient as string,
  };
}

export async function updateOtcFeeConfig(provider: BrowserProvider, feeBps: number, feeRecipient: string) {
  const signer = await provider.getSigner();
  const contract = getOtcContract(provider).connect(signer) as any;
  const tx = await contract.updateFeeConfig(feeBps, feeRecipient);
  return tx.wait();
}

export async function getLastTradePriceByRole(provider: BrowserProvider, role: number): Promise<bigint> {
  const contract = getOtcContract(provider) as any;
  return contract.lastTradePriceByRole(role);
}

export async function cleanupLowerOrders(provider: BrowserProvider, role: number, maxCancels: number) {
  const signer = await provider.getSigner();
  const contract = getOtcContract(provider).connect(signer) as any;
  const tx = await contract.cleanupLowerOrders(role, maxCancels, { gasLimit: 2_000_000n });
  return tx.wait();
}

export async function getActiveOrdersCount(provider: BrowserProvider): Promise<number> {
  const contract = getOtcContract(provider) as any;
  return Number(await contract.getActiveOrdersCount());
}

export async function getOtcUsdtAddress(provider: BrowserProvider): Promise<string> {
  const contract = getOtcContract(provider) as any;
  return contract.usdt();
}

export async function setOtcUsdtAddress(provider: BrowserProvider, newUsdtAddress: string) {
  const signer = await provider.getSigner();
  const contract = getOtcContract(provider).connect(signer) as any;
  const tx = await contract.setUsdtAddress(newUsdtAddress);
  return tx.wait();
}
