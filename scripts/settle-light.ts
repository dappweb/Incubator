import * as dotenv from "dotenv";
import { ethers } from "hardhat";

dotenv.config({ path: ".env" });

const swapAbi = [
  "function feeVault(uint8 pairId, address token) view returns (uint256)",
  "function settleLightFees() external",
  "function settleLightFeesIfDue() external returns (bool)",
  "function lastLightSettlementDay() view returns (uint256)",
  "function paused() view returns (bool)",
];

function readEnv(...keys: string[]) {
  for (const key of keys) {
    const value = process.env[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return "";
}

async function main() {
  const swapAddress = readEnv("SWAP_POOL_MANAGER_PROXY", "VITE_SWAP_POOL_ADDRESS");
  const lightAddress = readEnv("LIGHT_TOKEN_ADDRESS", "VITE_LIGHT_TOKEN_ADDRESS");
  const lightPairId = Number(readEnv("LIGHT_PAIR_ID", "SWAP_LIGHT_PAIR_ID") || "1");
  const minSettleAmount = BigInt(readEnv("LIGHT_SETTLE_MIN_AMOUNT") || "0");
  const manualSettle = (readEnv("LIGHT_SETTLE_MANUAL") || "false").toLowerCase() === "true";

  if (!ethers.isAddress(swapAddress)) {
    throw new Error("Missing or invalid SWAP_POOL_MANAGER_PROXY (or VITE_SWAP_POOL_ADDRESS)");
  }
  if (!ethers.isAddress(lightAddress)) {
    throw new Error("Missing or invalid LIGHT_TOKEN_ADDRESS (or VITE_LIGHT_TOKEN_ADDRESS)");
  }
  if (!Number.isInteger(lightPairId) || lightPairId < 0 || lightPairId > 255) {
    throw new Error("LIGHT_PAIR_ID must be an integer between 0 and 255");
  }

  const [signer] = await ethers.getSigners();
  console.log("[settle-light] signer:", signer.address);
  console.log("[settle-light] swap:", swapAddress);
  console.log("[settle-light] light:", lightAddress);
  console.log("[settle-light] pairId:", lightPairId);

  const swap = await ethers.getContractAt(swapAbi, swapAddress, signer);
  const isPaused: boolean = await swap.paused();
  if (isPaused) {
    console.log("[settle-light] swap contract is paused, skip");
    return;
  }

  const pending: bigint = await swap.feeVault(lightPairId, lightAddress);
  const lastDay: bigint = await swap.lastLightSettlementDay();
  console.log("[settle-light] pending light fee:", pending.toString());
  console.log("[settle-light] last settled day:", lastDay.toString());

  if (pending <= 0n) {
    console.log("[settle-light] no pending fee, skip");
    return;
  }
  if (pending < minSettleAmount) {
    console.log("[settle-light] below LIGHT_SETTLE_MIN_AMOUNT, skip");
    return;
  }

  if (manualSettle) {
    const tx = await swap.settleLightFees();
    console.log("[settle-light] manual settle tx:", tx.hash);
    const receipt = await tx.wait();
    console.log("[settle-light] confirmed in block:", receipt?.blockNumber ?? "unknown");
    return;
  }

  const tx = await swap.settleLightFeesIfDue();
  console.log("[settle-light] if-due tx:", tx.hash);
  const receipt = await tx.wait();
  console.log("[settle-light] confirmed in block:", receipt?.blockNumber ?? "unknown");
}

main().catch((error) => {
  console.error("[settle-light] failed:", error);
  process.exitCode = 1;
});
