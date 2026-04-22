import * as dotenv from "dotenv";
import { ethers } from "hardhat";

dotenv.config({ path: ".env" });

function readEnv(key: string, fallback = "") {
  return (process.env[key] || "").trim() || fallback;
}

async function main() {
  const coreAddress = readEnv("INCUBATOR_CORE_PROXY", readEnv("VITE_CORE_CONTRACT_ADDRESS"));
  if (!ethers.isAddress(coreAddress)) throw new Error("Missing INCUBATOR_CORE_PROXY");

  const [signer] = await ethers.getSigners();
  const core = await ethers.getContractAt(
    [
      "function cycleDuration() view returns (uint256)",
      "function setCycleDuration(uint256 newDuration) external",
      "function currentDay() view returns (uint256)",
      "function lastRewardSettlementDay() view returns (uint256)",
      "function rewardPoolBalance() view returns (uint256)",
      "function rewardParticipantsLength() view returns (uint256)",
      "function rewardParticipants(uint256 index) view returns (address)",
      "function settleDailyRewardsManual(address[] participants, uint256 lightPriceInUsdt) external",
      "function userOrderIdsLength(address user) view returns (uint256)",
      "function userOrderIds(address user, uint256 index) view returns (uint256)",
      "function orderRewardLedger(uint256 orderId) view returns (uint256 capAmount, uint256 staticPaid, uint256 dynamicPaid, bool exited)",
    ],
    coreAddress,
    signer
  );

  const originalCycle: bigint = await core.cycleDuration();
  let cycleChanged = false;

  try {
    const [dayBefore, lastDayBefore] = await Promise.all([core.currentDay(), core.lastRewardSettlementDay()]);
    console.log("=== verify-reward-distribution ===");
    console.log("signer:", signer.address);
    console.log("core:", coreAddress);
    console.log("currentDay(before):", dayBefore.toString(), "lastSettleDay:", lastDayBefore.toString());

    if (dayBefore <= lastDayBefore) {
      console.log("currentDay <= lastSettleDay, temporarily set cycleDuration=60 for verification...");
      const tx = await core.setCycleDuration(60);
      console.log("setCycleDuration tx:", tx.hash);
      await tx.wait();
      cycleChanged = true;
    }

    const participantCount: bigint = await core.rewardParticipantsLength();
    const participants: string[] = [];
    for (let i = 0; i < Number(participantCount); i++) {
      participants.push(await core.rewardParticipants(i));
    }

    if (participants.length === 0) throw new Error("no participants");

    const poolBefore: bigint = await core.rewardPoolBalance();
    console.log("rewardPoolBalance(before):", ethers.formatUnits(poolBefore, 18), "LIGHT");

    const sampleUser = participants[0];
    const userOrderLen: bigint = await core.userOrderIdsLength(sampleUser);
    if (userOrderLen === 0n) throw new Error("sample user has no orders");
    const sampleOrderId: bigint = await core.userOrderIds(sampleUser, 0);
    const [, sBefore, dBefore] = await core.orderRewardLedger(sampleOrderId);

    const price = ethers.parseUnits(readEnv("LIGHT_PRICE_USDT", "0.01"), 18);
    const settleTx = await core.settleDailyRewardsManual(participants, price, { gasLimit: 10_000_000n });
    console.log("settle tx:", settleTx.hash);
    const receipt = await settleTx.wait();
    console.log("settled block:", receipt?.blockNumber ?? "unknown");

    const [poolAfter, dayAfter, lastDayAfter] = await Promise.all([
      core.rewardPoolBalance(),
      core.currentDay(),
      core.lastRewardSettlementDay(),
    ]);

    const [, sAfter, dAfter] = await core.orderRewardLedger(sampleOrderId);

    console.log("rewardPoolBalance(after):", ethers.formatUnits(poolAfter, 18), "LIGHT");
    console.log("currentDay(after):", dayAfter.toString(), "lastSettleDay:", lastDayAfter.toString());
    console.log("sample order:", sampleOrderId.toString());
    console.log("staticPaid delta:", (sAfter - sBefore).toString());
    console.log("dynamicPaid delta:", (dAfter - dBefore).toString());

    if (sAfter <= sBefore && dAfter <= dBefore) {
      throw new Error("no static/dynamic payout delta found on sample order");
    }

    console.log("✅ reward distribution verified");
  } finally {
    if (cycleChanged) {
      const restore = await core.setCycleDuration(originalCycle);
      await restore.wait();
      console.log("cycleDuration restored to", originalCycle.toString());
    }
  }
}

main().catch((e) => {
  console.error("[verify-reward-distribution] ERROR:", e?.message || e);
  process.exitCode = 1;
});
