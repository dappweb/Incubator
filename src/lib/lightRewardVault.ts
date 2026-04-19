import { AbstractSigner, BrowserProvider, Contract } from "ethers";
import { LIGHT_REWARD_VAULT_ADDRESS } from "../config";

const vaultAbi = [
  "function claimable(address user) view returns (uint256)",
  "function totalPending() view returns (uint256)",
  "function totalClaimed() view returns (uint256)",
  "function vaultBalance() view returns (uint256)",
  "function undistributedBalance() view returns (uint256)",
  "function operator() view returns (address)",
  "function claim() returns (uint256)",
  "function paused() view returns (bool)",
];

export function hasLightRewardVault(): boolean {
  return Boolean(LIGHT_REWARD_VAULT_ADDRESS);
}

function getVault(provider: BrowserProvider) {
  if (!LIGHT_REWARD_VAULT_ADDRESS) {
    throw new Error("LIGHT_REWARD_VAULT_ADDRESS not configured");
  }
  return new Contract(LIGHT_REWARD_VAULT_ADDRESS, vaultAbi, provider);
}

export async function getLightClaimable(
  provider: BrowserProvider,
  user: string,
): Promise<bigint> {
  if (!hasLightRewardVault()) return 0n;
  try {
    const c = getVault(provider) as any;
    return (await c.claimable(user)) as bigint;
  } catch {
    return 0n;
  }
}

export async function getLightVaultStats(provider: BrowserProvider) {
  const c = getVault(provider) as any;
  const [totalPending, totalClaimed, vaultBalance] = await Promise.all([
    c.totalPending() as Promise<bigint>,
    c.totalClaimed() as Promise<bigint>,
    c.vaultBalance() as Promise<bigint>,
  ]);
  return { totalPending, totalClaimed, vaultBalance };
}

export async function claimLightReward(
  provider: BrowserProvider,
  signer?: AbstractSigner,
) {
  if (!signer) signer = await provider.getSigner();
  const c = getVault(provider).connect(signer) as any;
  const tx = await c.claim({ gasLimit: 200000n });
  return tx.wait();
}
