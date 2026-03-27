import { BrowserProvider } from "ethers";
import { approveIdentityOperator, getUserIdentityId, isIdentityOperatorApproved } from "./coreContract";

export async function getTokenOfOwner(provider: BrowserProvider, owner: string): Promise<bigint | null> {
  const identityId = await getUserIdentityId(provider, owner);
  if (identityId === 0n) {
    return null;
  }

  return identityId;
}

export async function approveIdentityForOtc(
  provider: BrowserProvider,
  identityId: bigint,
  otcAddress: string,
) {
  return approveIdentityOperator(provider, identityId, otcAddress, true);
}

export async function isIdentityApproved(
  provider: BrowserProvider,
  identityId: bigint,
  otcAddress: string,
): Promise<boolean> {
  return isIdentityOperatorApproved(provider, identityId, otcAddress);
}
