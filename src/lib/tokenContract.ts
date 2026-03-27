import { BrowserProvider, Contract, formatUnits, parseUnits } from "ethers";

const erc20Abi = [
  "function balanceOf(address account) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
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

export async function approveToken(provider: BrowserProvider, tokenAddress: string, spender: string, amount: bigint) {
  const signer = await provider.getSigner();
  const contract = getTokenContract(provider, tokenAddress).connect(signer) as any;
  const tx = await contract.approve(spender, amount);
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
