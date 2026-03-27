import { BrowserProvider, Contract, formatUnits, parseUnits } from "ethers";
import { USDT_CONTRACT_ADDRESS } from "../config";

const usdtAbi = [
  "function balanceOf(address account) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function decimals() view returns (uint8)",
];

export function getUsdtContract(provider: BrowserProvider) {
  if (!USDT_CONTRACT_ADDRESS) {
    throw new Error("缺少 VITE_USDT_CONTRACT_ADDRESS 配置");
  }

  return new Contract(USDT_CONTRACT_ADDRESS, usdtAbi, provider);
}

export async function getUsdtBalance(provider: BrowserProvider, account: string) {
  const contract = getUsdtContract(provider) as any;
  return contract.balanceOf(account) as Promise<bigint>;
}

export async function getUsdtAllowance(provider: BrowserProvider, owner: string, spender: string) {
  const contract = getUsdtContract(provider) as any;
  return contract.allowance(owner, spender) as Promise<bigint>;
}

export async function approveUsdt(provider: BrowserProvider, spender: string, amount: bigint) {
  const signer = await provider.getSigner();
  const contract = getUsdtContract(provider).connect(signer) as any;
  const tx = await contract.approve(spender, amount);
  return tx.wait();
}

export function parseUsdt(value: string) {
  return parseUnits(value, 6);
}

export function formatUsdt(value: bigint) {
  return formatUnits(value, 6);
}
