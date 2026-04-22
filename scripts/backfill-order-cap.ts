import * as dotenv from "dotenv";
import { ethers } from "hardhat";

dotenv.config({ path: ".env" });

function readEnv(key: string, fallback = "") {
  return (process.env[key] || "").trim() || fallback;
}

async function main() {
  const coreAddress = readEnv("INCUBATOR_CORE_PROXY", readEnv("VITE_CORE_CONTRACT_ADDRESS"));
  if (!coreAddress || !ethers.isAddress(coreAddress)) {
    throw new Error("Missing INCUBATOR_CORE_PROXY");
  }

  const batchSize = Number(readEnv("BACKFILL_BATCH_SIZE", "30"));
  if (!Number.isInteger(batchSize) || batchSize <= 0) {
    throw new Error("BACKFILL_BATCH_SIZE must be a positive integer");
  }

  const [signer] = await ethers.getSigners();
  const core = await ethers.getContractAt(
    [
      "function nextMachineOrderId() view returns (uint256)",
      "function orderRewardLedger(uint256) view returns (uint256 capAmount, uint256 staticPaid, uint256 dynamicPaid, bool exited)",
      "function backfillOrderCap(uint256[] orderIds) external",
      "function rewardCapBps() view returns (uint16)",
    ],
    coreAddress,
    signer
  );

  const nextOrderId: bigint = await core.nextMachineOrderId();
  const rewardCapBps: bigint = await core.rewardCapBps();

  console.log("=== backfill-order-cap ===");
  console.log("signer:", signer.address);
  console.log("core:", coreAddress);
  console.log("rewardCapBps:", rewardCapBps.toString());
  console.log("nextMachineOrderId:", nextOrderId.toString());

  if (rewardCapBps === 0n) {
    throw new Error("rewardCapBps is 0, please call updateRewardConfig first");
  }

  const missing: bigint[] = [];
  for (let id = 1n; id < nextOrderId; id++) {
    const [capAmount] = await core.orderRewardLedger(id);
    if (capAmount === 0n) missing.push(id);
  }

  console.log("orders with capAmount=0:", missing.length);
  if (missing.length === 0) {
    console.log("nothing to backfill");
    return;
  }

  let txCount = 0;
  for (let i = 0; i < missing.length; i += batchSize) {
    const batch = missing.slice(i, i + batchSize);
    const tx = await core.backfillOrderCap(batch, { gasLimit: 8_000_000n });
    console.log(`batch ${Math.floor(i / batchSize) + 1}: tx=${tx.hash}, size=${batch.length}`);
    await tx.wait();
    txCount++;
  }

  let remaining = 0;
  for (let id = 1n; id < nextOrderId; id++) {
    const [capAmount] = await core.orderRewardLedger(id);
    if (capAmount === 0n) remaining++;
  }

  console.log("backfill tx count:", txCount);
  console.log("remaining capAmount=0:", remaining);
  console.log("✅ backfill-order-cap done");
}

main().catch((e) => {
  console.error("[backfill-order-cap] ERROR:", e?.message || e);
  process.exitCode = 1;
});
