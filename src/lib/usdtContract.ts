import { AbstractSigner, BrowserProvider, Contract, formatUnits, isAddress, parseUnits } from "ethers";
import { USDT_CONTRACT_ADDRESS } from "../config";
import { getUsdtAddress } from "./swapContract";

const envDecimals = Number(import.meta.env.VITE_USDT_DECIMALS ?? "18");
export const USDT_DECIMALS = Number.isInteger(envDecimals) && envDecimals > 0 ? envDecimals : 18;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const usdtAbi = [
  "function balanceOf(address account) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function decimals() view returns (uint8)",
];

export async function resolveUsdtAddress(provider: BrowserProvider) {
  try {
    const onChainAddress = await getUsdtAddress(provider);
    if (isAddress(onChainAddress) && onChainAddress.toLowerCase() !== ZERO_ADDRESS) {
      return onChainAddress;
    }
  } catch {
    // Fallback to env when swap contract is unavailable.
  }

  if (!USDT_CONTRACT_ADDRESS) {
    throw new Error("缺少 VITE_USDT_CONTRACT_ADDRESS 配置");
  }

  return USDT_CONTRACT_ADDRESS;
}

export async function getUsdtContract(provider: BrowserProvider) {
  const usdtAddress = await resolveUsdtAddress(provider);
  return new Contract(usdtAddress, usdtAbi, provider);
}

export async function getUsdtBalance(provider: BrowserProvider, account: string) {
  const contract = (await getUsdtContract(provider)) as any;
  return contract.balanceOf(account) as Promise<bigint>;
}

export async function getUsdtAllowance(provider: BrowserProvider, owner: string, spender: string) {
  const contract = (await getUsdtContract(provider)) as any;
  return contract.allowance(owner, spender) as Promise<bigint>;
}

export async function approveUsdt(provider: BrowserProvider, spender: string, amount: bigint, signer?: AbstractSigner) {
  if (!signer) signer = await provider.getSigner();
  const contract = (await getUsdtContract(provider)).connect(signer) as any;
  const tx = await contract.approve(spender, amount, { gasLimit: 100_000n });
  return tx.wait();
}

export function parseUsdt(value: string) {
  return parseUnits(value, USDT_DECIMALS);
}

export function formatUsdt(value: bigint) {
  return formatUnits(value, USDT_DECIMALS);
}
