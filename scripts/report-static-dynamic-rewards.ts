import * as dotenv from "dotenv";
import { ethers } from "hardhat";

dotenv.config({ path: ".env" });

function readEnv(key: string, fallback = "") {
  return (process.env[key] || "").trim() || fallback;
}

async function main() {
  const coreAddress = readEnv("INCUBATOR_CORE_PROXY", readEnv("VITE_CORE_CONTRACT_ADDRESS"));
  if (!ethers.isAddress(coreAddress)) throw new Error("Missing INCUBATOR_CORE_PROXY");

  const lightPriceStr = readEnv("LIGHT_PRICE_USDT", "0.01");
  const lightPrice = parseFloat(lightPriceStr);
  if (isNaN(lightPrice) || lightPrice <= 0) throw new Error("Invalid LIGHT_PRICE_USDT");

  const [signer] = await ethers.getSigners();
  const core = await ethers.getContractAt(
    [
      "function nextMachineOrderId() view returns (uint256)",
      "function machineOrders(uint256 id) view returns (address user, uint256 amountUSDT, uint256 quantity, uint256 timestamp, uint256 refundAmount, bool exited)",
      "function orderRewardLedger(uint256 orderId) view returns (uint256 capAmount, uint256 staticPaid, uint256 dynamicPaid, bool exited)",
      "function rewardParticipantsLength() view returns (uint256)",
      "function rewardParticipants(uint256 index) view returns (address)",
    ],
    coreAddress,
    signer
  );

  console.log("=== STATIC/DYNAMIC REWARD DISTRIBUTION REPORT (LIGHT TOKENS) ===\n");
  console.log("Core Address:", coreAddress);
  console.log("LIGHT Price:", lightPriceStr, "USDT");
  console.log("Timestamp:", new Date().toISOString());

  const nextOrderId: bigint = await core.nextMachineOrderId();
  console.log("\nTotal Orders:", nextOrderId.toString());

  let totalStatic = 0n;
  let totalDynamic = 0n;
  let totalCap = 0n;
  let nonZeroStaticOrders = 0;
  let nonZeroDynamicOrders = 0;
  let zeroCapOrders = 0;

  const orderDetails: any[] = [];

  for (let orderId = 1; orderId < Number(nextOrderId); orderId++) {
    const [capAmount, staticPaid, dynamicPaid] = await core.orderRewardLedger(orderId);
    const [user, amountUSDT, quantity] = await core.machineOrders(orderId);

    totalStatic += staticPaid;
    totalDynamic += dynamicPaid;
    totalCap += capAmount;

    if (staticPaid > 0n) nonZeroStaticOrders++;
    if (dynamicPaid > 0n) nonZeroDynamicOrders++;
    if (capAmount === 0n) zeroCapOrders++;

    const staticLIGHT = parseFloat(ethers.formatUnits(staticPaid, 18)) / lightPrice;
    const dynamicLIGHT = parseFloat(ethers.formatUnits(dynamicPaid, 18)) / lightPrice;
    const totalLIGHT = staticLIGHT + dynamicLIGHT;

    orderDetails.push({
      orderId,
      user,
      amountUSDT: ethers.formatUnits(amountUSDT, 18),
      capAmount: ethers.formatUnits(capAmount, 18),
      staticUSDT: ethers.formatUnits(staticPaid, 18),
      dynamicUSDT: ethers.formatUnits(dynamicPaid, 18),
      staticLIGHT: staticLIGHT.toFixed(6),
      dynamicLIGHT: dynamicLIGHT.toFixed(6),
      totalLIGHT: totalLIGHT.toFixed(6),
      staticRaw: staticPaid,
      dynamicRaw: dynamicPaid,
    });
  }

  // Sort by orderId ascending for detail view
  orderDetails.sort((a, b) => a.orderId - b.orderId);

  const totalStaticLIGHT = parseFloat(ethers.formatUnits(totalStatic, 18)) / lightPrice;
  const totalDynamicLIGHT = parseFloat(ethers.formatUnits(totalDynamic, 18)) / lightPrice;
  const totalDistributedLIGHT = totalStaticLIGHT + totalDynamicLIGHT;

  console.log("\n=== SUMMARY STATISTICS ===");
  console.log("Total Cap Amount:", ethers.formatUnits(totalCap, 18), "USDT");
  console.log("Total Static Rewards:", ethers.formatUnits(totalStatic, 18), "USDT =", totalStaticLIGHT.toFixed(6), "LIGHT");
  console.log("Total Dynamic Rewards:", ethers.formatUnits(totalDynamic, 18), "USDT =", totalDynamicLIGHT.toFixed(6), "LIGHT");
  console.log("Total Rewards Distributed:", ethers.formatUnits(totalStatic + totalDynamic, 18), "USDT =", totalDistributedLIGHT.toFixed(6), "LIGHT");
  console.log("\nOrders with Static Rewards:", nonZeroStaticOrders, "/", (Number(nextOrderId) - 1));
  console.log("Orders with Dynamic Rewards:", nonZeroDynamicOrders, "/", (Number(nextOrderId) - 1));
  console.log("Orders with Zero Cap:", zeroCapOrders, "/", (Number(nextOrderId) - 1));

  const participantCount: bigint = await core.rewardParticipantsLength();
  console.log("\nActive Reward Participants:", participantCount.toString());

  // Per-address aggregation
  const byUser: Record<string, { staticLIGHT: number; dynamicLIGHT: number; orders: number[] }> = {};
  for (const d of orderDetails) {
    if (!byUser[d.user]) byUser[d.user] = { staticLIGHT: 0, dynamicLIGHT: 0, orders: [] };
    byUser[d.user].staticLIGHT += parseFloat(d.staticLIGHT);
    byUser[d.user].dynamicLIGHT += parseFloat(d.dynamicLIGHT);
    byUser[d.user].orders.push(d.orderId);
  }

  const userList = Object.entries(byUser).sort((a, b) => (b[1].staticLIGHT + b[1].dynamicLIGHT) - (a[1].staticLIGHT + a[1].dynamicLIGHT));

  console.log("\n=== 按地址汇总发放明细 ===");
  console.log("Address                                    | Orders | Static(LIGHT) | Dynamic(LIGHT) | Total(LIGHT)");
  console.log("-".repeat(100));
  for (const [addr, info] of userList) {
    const total = (info.staticLIGHT + info.dynamicLIGHT).toFixed(6);
    console.log(
      `${addr} | ${info.orders.length.toString().padEnd(6)} | ${info.staticLIGHT.toFixed(6).padStart(13)} | ${info.dynamicLIGHT.toFixed(6).padStart(14)} | ${total.padStart(12)}`
    );
  }

  console.log("\n=== 订单发放明细（全量） ===");
  console.log("OrderId | Address                                    | Cap(USDT)  | Static(LIGHT) | Dynamic(LIGHT) | Total(LIGHT)");
  console.log("-".repeat(110));
  for (const d of orderDetails) {
    console.log(
      `${d.orderId.toString().padEnd(7)} | ${d.user} | ${parseFloat(d.capAmount).toFixed(2).padStart(10)} | ${d.staticLIGHT.padStart(13)} | ${d.dynamicLIGHT.padStart(14)} | ${d.totalLIGHT.padStart(12)}`
    );
  }

  console.log("\n=== CSV格式（可导入Excel） ===");
  console.log("OrderId,Address,CapAmount_USDT,Static_LIGHT,Dynamic_LIGHT,Total_LIGHT");
  for (const d of orderDetails) {
    console.log(
      `${d.orderId},${d.user},${parseFloat(d.capAmount).toFixed(2)},${d.staticLIGHT},${d.dynamicLIGHT},${d.totalLIGHT}`
    );
  }
}

main().catch((e) => {
  console.error("[report-static-dynamic-rewards] ERROR:", e?.message || e);
  process.exitCode = 1;
});
