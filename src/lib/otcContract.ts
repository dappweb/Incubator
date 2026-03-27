import { BrowserProvider, Contract } from "ethers";
import { OTC_CONTRACT_ADDRESS } from "../config";

const otcAbi = [
  "function createOrder(uint256 identityId, uint256 priceUSDT)",
  "function cancelOrder(uint256 orderId)",
  "function fillOrder(uint256 orderId)",
  "function getOrder(uint256 orderId) view returns ((uint256 id,uint256 identityId,uint8 role,address seller,uint256 priceUSDT,bool active))",
  "function getActiveOrderIds() view returns (uint256[])",
  "function getIdentityActiveOrder(uint256 identityId) view returns (uint256)",
  "function lastTradePriceByRole(uint8 role) view returns (uint256)",
  "function feeBps() view returns (uint256)",
];

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
  return contract.getOrder(orderId);
}

export async function createOtcOrder(
  provider: BrowserProvider,
  identityId: bigint,
  priceUSDT: bigint,
) {
  const signer = await provider.getSigner();
  const contract = getOtcContract(provider).connect(signer) as any;
  const tx = await contract.createOrder(identityId, priceUSDT);
  return tx.wait();
}

export async function cancelOtcOrder(provider: BrowserProvider, orderId: bigint) {
  const signer = await provider.getSigner();
  const contract = getOtcContract(provider).connect(signer) as any;
  const tx = await contract.cancelOrder(orderId);
  return tx.wait();
}

export async function fillOtcOrder(provider: BrowserProvider, orderId: bigint) {
  const signer = await provider.getSigner();
  const contract = getOtcContract(provider).connect(signer) as any;
  const tx = await contract.fillOrder(orderId);
  return tx.wait();
}

export async function getOtcFeeBps(provider: BrowserProvider): Promise<number> {
  const contract = getOtcContract(provider) as any;
  const value = (await contract.feeBps()) as bigint;
  return Number(value);
}
