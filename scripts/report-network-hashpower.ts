import * as dotenv from "dotenv";
import { ethers } from "hardhat";

dotenv.config({ path: ".env" });

function readEnv(key: string, fallback = "") {
  return (process.env[key] || "").trim() || fallback;
}

function fmt(val: bigint, decimals = 18): string {
  return parseFloat(ethers.formatUnits(val, decimals)).toFixed(2);
}

async function main() {
  const coreAddress = readEnv("INCUBATOR_CORE_PROXY", readEnv("VITE_CORE_CONTRACT_ADDRESS"));
  if (!ethers.isAddress(coreAddress)) throw new Error("Missing INCUBATOR_CORE_PROXY");

  const [signer] = await ethers.getSigners();
  const core = await ethers.getContractAt(
    [
      "function nextMachineOrderId() view returns (uint256)",
      "function machineOrders(uint256 id) view returns (uint256 id, address user, uint256 quantity, uint256 amountUSDT, address referrer, uint256 createdAt)",
      "function teamTotalVolume(address user) view returns (uint256)",
      "function maxBranchVolume(address user) view returns (uint256)",
      "function directReferralVolume(address user) view returns (uint256)",
      "function referralOf(address user) view returns (address)",
      "function rewardParticipantsLength() view returns (uint256)",
      "function rewardParticipants(uint256 index) view returns (address)",
      "function machineUnitPrice() view returns (uint256)",
      "function orderRewardLedger(uint256 orderId) view returns (uint256 capAmount, uint256 staticPaid, uint256 dynamicPaid, bool exited)",
    ],
    coreAddress,
    signer
  );

  console.log("=== 全网累计业绩 / 矿机算力报告 ===\n");
  console.log("Core Address:", coreAddress);
  console.log("Timestamp:", new Date().toISOString());

  const nextOrderId: bigint = await core.nextMachineOrderId();
  const totalOrders = Number(nextOrderId) - 1;
  const unitPrice: bigint = await core.machineUnitPrice();

  console.log("\n矿机单价:", fmt(unitPrice), "USDT");
  console.log("总订单数:", totalOrders);

  // Scan all orders to build per-user data
  let globalTotal = 0n;
  let globalActive = 0n;
  let globalExited = 0n;
  let activeOrderCount = 0;
  let exitedOrderCount = 0;

  const userMap: Record<string, {
    selfPurchase: bigint;
    orders: Array<{ orderId: number; amount: bigint; quantity: bigint; exited: boolean; timestamp: bigint }>;
  }> = {};

  for (let orderId = 1; orderId <= totalOrders; orderId++) {
    const [, user, quantity, amountUSDT, , createdAt] = await core.machineOrders(orderId);
    const [, , , exited] = await core.orderRewardLedger(orderId);

    globalTotal += amountUSDT;
    if (exited) {
      globalExited += amountUSDT;
      exitedOrderCount++;
    } else {
      globalActive += amountUSDT;
      activeOrderCount++;
    }

    if (!userMap[user]) userMap[user] = { selfPurchase: 0n, orders: [] };
    userMap[user].selfPurchase += amountUSDT;
    userMap[user].orders.push({ orderId, amount: amountUSDT, quantity, exited, timestamp: createdAt });
  }

  const allUsers = Object.keys(userMap);

  // Fetch team volumes for all users
  const userStats: Array<{
    address: string;
    selfPurchase: bigint;
    teamTotal: bigint;
    maxBranch: bigint;
    smallArea: bigint;
    directVol: bigint;
    referrer: string;
    orderCount: number;
    activeOrders: number;
    orders: Array<{ orderId: number; amount: bigint; quantity: bigint; exited: boolean; timestamp: bigint }>;
  }> = [];

  for (const addr of allUsers) {
    const [teamTotal, maxBranch, directVol, referrer] = await Promise.all([
      core.teamTotalVolume(addr),
      core.maxBranchVolume(addr),
      core.directReferralVolume(addr),
      core.referralOf(addr),
    ]);
    const smallArea = teamTotal > maxBranch ? teamTotal - maxBranch : 0n;
    userStats.push({
      address: addr,
      selfPurchase: userMap[addr].selfPurchase,
      teamTotal,
      maxBranch,
      smallArea,
      directVol,
      referrer,
      orderCount: userMap[addr].orders.length,
      activeOrders: userMap[addr].orders.filter(o => !o.exited).length,
      orders: userMap[addr].orders,
    });
  }

  // Sort by selfPurchase descending
  userStats.sort((a, b) => (b.selfPurchase > a.selfPurchase ? 1 : b.selfPurchase < a.selfPurchase ? -1 : 0));

  console.log("\n=== 全网算力汇总 ===");
  console.log("全网总购买金额(USDT):", fmt(globalTotal));
  console.log("  - 有效算力(未退出):", fmt(globalActive), "USDT  (" + activeOrderCount + "笔)");
  console.log("  - 已退出算力:       ", fmt(globalExited), "USDT  (" + exitedOrderCount + "笔)");
  console.log("参与地址数:", allUsers.length);

  const participantCount: bigint = await core.rewardParticipantsLength();
  console.log("奖励参与者数:", participantCount.toString());

  console.log("\n=== 用户算力明细（按个人购买额降序）===");
  console.log(
    "地址                                       | 订单数 | 自购(USDT) | 直推业绩(USDT) | 团队总业绩(USDT) | 最大支线(USDT) | 小区业绩(USDT)"
  );
  console.log("-".repeat(130));
  for (const u of userStats) {
    console.log(
      `${u.address} | ${u.orderCount.toString().padEnd(6)} | ${fmt(u.selfPurchase).padStart(10)} | ${fmt(u.directVol).padStart(14)} | ${fmt(u.teamTotal).padStart(16)} | ${fmt(u.maxBranch).padStart(14)} | ${fmt(u.smallArea).padStart(14)}`
    );
  }

  console.log("\n=== 订单详情（全量，按订单号排序）===");
  console.log("订单 | 地址                                       | 数量 | 金额(USDT) | 时间                | 状态");
  console.log("-".repeat(110));
  const allOrders: Array<{ orderId: number; user: string; amount: bigint; quantity: bigint; exited: boolean; timestamp: bigint }> = [];
  for (const u of userStats) {
    for (const o of u.orders) {
      allOrders.push({ ...o, user: u.address });
    }
  }
  allOrders.sort((a, b) => a.orderId - b.orderId);
  for (const o of allOrders) {
    const dt = new Date(Number(o.timestamp) * 1000).toISOString().replace("T", " ").slice(0, 19);
    console.log(
      `${o.orderId.toString().padEnd(4)} | ${o.user} | ${o.quantity.toString().padEnd(4)} | ${fmt(o.amount).padStart(10)} | ${dt} | ${o.exited ? "已退出" : "有效"}`
    );
  }

  console.log("\n=== CSV格式（可导入Excel）===");
  console.log("地址,自购金额_USDT,订单数,直推业绩_USDT,团队总业绩_USDT,最大支线_USDT,小区业绩_USDT");
  for (const u of userStats) {
    console.log(`${u.address},${fmt(u.selfPurchase)},${u.orderCount},${fmt(u.directVol)},${fmt(u.teamTotal)},${fmt(u.maxBranch)},${fmt(u.smallArea)}`);
  }
}

main().catch((e) => {
  console.error("[report-network-hashpower] ERROR:", e?.message || e);
  process.exitCode = 1;
});
