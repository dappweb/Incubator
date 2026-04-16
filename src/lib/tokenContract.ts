import { AbstractSigner, BrowserProvider, Contract, formatUnits, parseUnits } from "ethers";
import { ICO_TOKEN_ADDRESS } from "../config";

const erc20Abi = [
  "function balanceOf(address account) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
];

const icoTokenAbi = [
  ...erc20Abi,
  "function totalBurned() view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function saleAllocationWallet() view returns (address)",
  "function burnExecutors(address) view returns (bool)",
  "function owner() view returns (address)",
  "function mint(address to, uint256 amount) external",
  "function setSaleAllocationWallet(address newWallet) external",
  "function setBurnExecutor(address executor, bool allowed) external",
  "function burnUnsold(uint256 amount) external",
];

export function getTokenContract(provider: BrowserProvider, tokenAddress: string) {
  if (!tokenAddress) {
    throw new Error("缺少代币地址配置");
  }

  return new Contract(tokenAddress, erc20Abi, provider);
}

export async function getTokenBalance(provider: BrowserProvider, tokenAddress: string, account: string) {
  const contract = getTokenContract(provider, tokenAddress) as any;
  return contract.balanceOf(account) as Promise<bigint>;
}

export async function getTokenAllowance(provider: BrowserProvider, tokenAddress: string, owner: string, spender: string) {
  const contract = getTokenContract(provider, tokenAddress) as any;
  return contract.allowance(owner, spender) as Promise<bigint>;
}

export async function approveToken(provider: BrowserProvider, tokenAddress: string, spender: string, amount: bigint, signer?: AbstractSigner) {
  if (!signer) signer = await provider.getSigner();
  const contract = getTokenContract(provider, tokenAddress).connect(signer) as any;
  const tx = await contract.approve(spender, amount, { gasLimit: 100_000n });
  return tx.wait();
}

export async function getTokenMeta(provider: BrowserProvider, tokenAddress: string) {
  const contract = getTokenContract(provider, tokenAddress) as any;
  const [symbol, decimals] = await Promise.all([contract.symbol(), contract.decimals()]);
  return {
    symbol: String(symbol),
    decimals: Number(decimals),
  };
}

export function formatTokenAmount(value: bigint, decimals: number) {
  return formatUnits(value, decimals);
}

export function parseTokenAmount(value: string, decimals: number) {
  return parseUnits(value || "0", decimals);
}

// ── ICO Token admin functions ──

function getIcoTokenContract(provider: BrowserProvider) {
  if (!ICO_TOKEN_ADDRESS) throw new Error("缺少 VITE_ICO_TOKEN_ADDRESS 配置");
  return new Contract(ICO_TOKEN_ADDRESS, icoTokenAbi, provider);
}

export type IcoTokenInfo = {
  totalSupply: bigint; totalBurned: bigint;
  saleAllocationWallet: string; owner: string;
};

export async function getIcoTokenInfo(provider: BrowserProvider): Promise<IcoTokenInfo> {
  const c = getIcoTokenContract(provider) as any;
  const [totalSupply, totalBurned, saleAllocationWallet, owner] = await Promise.all([
    c.totalSupply(), c.totalBurned(), c.saleAllocationWallet(), c.owner(),
  ]);
  return { totalSupply, totalBurned, saleAllocationWallet, owner };
}

export async function isBurnExecutor(provider: BrowserProvider, addr: string): Promise<boolean> {
  return Boolean(await (getIcoTokenContract(provider) as any).burnExecutors(addr));
}

export async function mintIcoToken(provider: BrowserProvider, to: string, amount: bigint) {
  const signer = await provider.getSigner();
  return (await (getIcoTokenContract(provider).connect(signer) as any).mint(to, amount)).wait();
}

export async function setSaleAllocationWallet(provider: BrowserProvider, newWallet: string) {
  const signer = await provider.getSigner();
  return (await (getIcoTokenContract(provider).connect(signer) as any).setSaleAllocationWallet(newWallet)).wait();
}

export async function setBurnExecutor(provider: BrowserProvider, executor: string, allowed: boolean) {
  const signer = await provider.getSigner();
  return (await (getIcoTokenContract(provider).connect(signer) as any).setBurnExecutor(executor, allowed)).wait();
}

export async function burnUnsold(provider: BrowserProvider, amount: bigint) {
  const signer = await provider.getSigner();
  return (await (getIcoTokenContract(provider).connect(signer) as any).burnUnsold(amount)).wait();
}
